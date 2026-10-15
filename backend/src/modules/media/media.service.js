'use strict';

const { randomUUID } = require('node:crypto');
const { pool } = require('../../config/database');
const storage = require('../../config/storage');
const { withTransaction } = require('../../core/database/transaction');
const { appendOutboxEvent } = require('../../core/events/outbox');
const ApiError = require('../../core/errors/ApiError');
const logger = require('../../core/logging/logger');
const mediaRepository = require('./media.repository');
const policy = require('./media.policy');

const UPLOAD_URL_TTL_SECONDS = 600;
const DOWNLOAD_URL_TTL_SECONDS = 300;

// Other modules register checks for references that are not foreign keys (e.g. CMS JSON).
const referenceChecks = [];

function registerReferenceCheck(check) {
  referenceChecks.push(check);
}

const iso = (value) => (value ? value.toISOString() : null);

function toMedia(row, url = row.public_url) {
  return {
    id: row.id,
    purpose: row.purpose,
    visibility: row.visibility,
    status: row.status,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    width: row.width,
    height: row.height,
    altText: row.alt_text,
    url: url ?? null,
    createdAt: iso(row.created_at),
  };
}

const location = (row) => ({ visibility: row.visibility, key: row.storage_key });
const notFound = () => ApiError.notFound('Media not found', 'MEDIA_NOT_FOUND');

/** Step 1: reserve an asset and return a short-lived presigned PUT URL. */
async function initUpload(actor, { purpose, mimeType, fileSize, altText }) {
  policy.assertCanUpload(actor, purpose, { mimeType, fileSize });
  const { visibility } = policy.PURPOSES[purpose];
  const id = randomUUID();
  const now = new Date();
  const storageKey = `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${policy.EXTENSIONS[mimeType]}`;

  const row = await mediaRepository.insert(pool, { id, uploadedBy: actor.actorUserId, purpose, storageKey, mimeType, fileSize, altText, visibility });
  const uploadUrl = await storage.presignUpload({
    visibility,
    key: storageKey,
    contentType: mimeType,
    contentLength: fileSize,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
  return {
    media: toMedia(row, null),
    upload: {
      method: 'PUT',
      url: uploadUrl,
      headers: { 'Content-Type': mimeType, 'Content-Length': String(fileSize) },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    },
  };
}

/**
 * Step 2: verify the uploaded object (exists, declared size/type, real file signature)
 * before it becomes usable. Invalid uploads are rejected and the object removed.
 */
async function completeUpload(actor, { mediaId }) {
  const media = await mediaRepository.findById(pool, mediaId);
  if (!media || media.uploaded_by !== actor.actorUserId) throw notFound();
  if (media.status === 'ready') return toMedia(media);
  if (media.status !== 'pending') throw ApiError.conflict('This upload was rejected; start a new upload', 'UPLOAD_REJECTED');

  const head = await storage.headObject(location(media));
  if (!head) throw ApiError.conflict('The file has not been uploaded yet', 'UPLOAD_NOT_FOUND');

  const sniffed = policy.sniffMimeType(await storage.readPrefix(location(media)));
  const problems = [];
  if (head.contentLength !== Number(media.file_size)) problems.push('size does not match the declared fileSize');
  if (sniffed !== media.mime_type) problems.push('file content does not match the declared mimeType');
  if (problems.length > 0) {
    await mediaRepository.markRejected(pool, media.id);
    await storage.deleteObject(location(media)).catch((err) => logger.warn({ err: { message: err.message }, mediaId }, 'Failed to delete rejected upload'));
    throw new ApiError(422, 'UPLOAD_INVALID', 'Uploaded file failed verification', problems);
  }

  const ready = await withTransaction(async (client) => {
    const row = await mediaRepository.markReady(client, media.id, media.visibility === 'public' ? storage.publicUrl(media.storage_key) : null);
    await appendOutboxEvent(client, {
      eventType: 'media.uploaded',
      aggregateType: 'media_asset',
      aggregateId: media.id,
      payload: { mediaId: media.id, purpose: media.purpose, mimeType: media.mime_type },
    });
    return row;
  });
  return toMedia(ready);
}

/** Public assets are visible to any signed-in user; private ones only to the uploader or a media manager. */
async function getMedia(actor, id) {
  const media = await mediaRepository.findById(pool, id);
  if (!media) throw notFound();
  if (media.visibility === 'public' && media.status === 'ready') return toMedia(media);
  if (!policy.canManage(actor, media)) throw notFound();
  if (media.status !== 'ready') return toMedia(media, null);
  const url = await storage.presignDownload({ ...location(media), expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  return toMedia(media, url);
}

/** Deletes an asset nothing references. Link tables use FK RESTRICT; JSON references use registered checks. */
async function deleteMedia(actor, id) {
  const media = await withTransaction(async (client) => {
    const row = await mediaRepository.findById(client, id, { forUpdate: true });
    if (!row || !policy.canManage(actor, row)) throw notFound();
    for (const isReferenced of referenceChecks) {
      if (await isReferenced(client, id)) throw ApiError.conflict('Media is still in use', 'MEDIA_IN_USE');
    }
    try {
      await mediaRepository.deleteById(client, id);
    } catch (err) {
      if (err.code === '23503') throw ApiError.conflict('Media is still in use', 'MEDIA_IN_USE');
      throw err;
    }
    return row;
  });
  // After commit: a failed object delete leaves an orphan object, never a dangling row.
  await storage.deleteObject(location(media)).catch((err) => logger.warn({ err: { message: err.message }, mediaId: id }, 'Orphaned media object'));
}

// ---- Background processing (media-processing queue, housekeeping) ----

const SHARP_FORMAT = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Normalises a verified image: applies EXIF orientation, strips all metadata (camera
 * GPS location etc. must not be republished) and records width/height. Idempotent.
 */
async function processUploaded(mediaId) {
  const media = await mediaRepository.findById(pool, mediaId);
  if (!media || media.status !== 'ready' || !SHARP_FORMAT[media.mime_type] || media.width) return { skipped: true };
  const sharp = require('sharp');
  const original = await storage.getObject(location(media));
  const format = SHARP_FORMAT[media.mime_type];
  const { data, info } = await sharp(original, { failOn: 'error' })
    .rotate()
    .toFormat(format, format === 'jpeg' ? { quality: 85, mozjpeg: true } : {})
    .toBuffer({ resolveWithObject: true });
  await storage.putObject({ ...location(media), body: data, contentType: media.mime_type });
  await mediaRepository.updateProcessed(pool, mediaId, { width: info.width, height: info.height, fileSize: data.length });
  return { width: info.width, height: info.height, bytes: data.length };
}

/** Stores a platform-generated private file (e.g. a booking voucher) owned by `ownerUserId`. */
async function storeGeneratedDocument({ ownerUserId, purpose, mimeType, buffer }) {
  const rule = policy.PURPOSES[purpose];
  if (!rule?.generatedOnly || !rule.mimeTypes.includes(mimeType) || buffer.length > rule.maxBytes) throw new Error(`Invalid generated document for ${purpose}`);
  const id = randomUUID();
  const now = new Date();
  const storageKey = `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${policy.EXTENSIONS[mimeType]}`;
  await storage.putObject({ visibility: rule.visibility, key: storageKey, body: buffer, contentType: mimeType });
  return mediaRepository.insertReady(pool, { id, uploadedBy: ownerUserId, purpose, storageKey, mimeType, fileSize: buffer.length, visibility: rule.visibility });
}

/** Deletes abandoned/rejected uploads older than `olderThanHours` (rows are unreferenced by construction). */
async function purgeStaleUploads({ olderThanHours = 24, limit = 100 } = {}) {
  const stale = await mediaRepository.listStalePending(pool, olderThanHours, limit);
  for (const media of stale) {
    await storage.deleteObject(location(media)).catch(() => {});
    await mediaRepository.deleteById(pool, media.id);
  }
  return stale.length;
}

// ---- Interfaces for other modules ----

/**
 * Validates that `mediaId` may be attached by the actor: ready, one of `purposes`,
 * and uploaded by the actor unless they manage media. Returns the asset DTO.
 */
async function assertAttachable(db, actor, mediaId, { purposes }) {
  const media = await mediaRepository.findById(db, mediaId);
  const invalid = (message) => ApiError.validation([{ location: 'body', path: 'mediaId', message }]);
  if (!media || !policy.canManage(actor, media)) throw invalid('media not found');
  if (media.status !== 'ready') throw invalid('media upload is not complete');
  if (!purposes.includes(media.purpose)) throw invalid(`media must be one of: ${purposes.join(', ')}`);
  return toMedia(media);
}

/**
 * Media DTO with a short-lived signed URL for private assets, for callers whose
 * module has already authorised access (e.g. admins reviewing partner documents).
 */
async function getForAuthorizedReview(id, db = pool) {
  const media = await mediaRepository.findById(db, id);
  if (!media) return null;
  if (media.visibility === 'public' || media.status !== 'ready') return toMedia(media);
  return toMedia(media, await storage.presignDownload({ ...location(media), expiresIn: DOWNLOAD_URL_TTL_SECONDS }));
}

/**
 * Groups gallery link rows ({ owner_id, media_id, sort_order, is_cover }) into
 * Map<ownerId, image[]> with public URLs; links to unavailable media are skipped.
 */
async function buildGalleries(links, db = pool) {
  const media = await getPublicMediaMap(links.map((link) => link.media_id), db);
  const galleries = new Map();
  for (const link of links) {
    const item = media.get(link.media_id);
    if (!item) continue;
    if (!galleries.has(link.owner_id)) galleries.set(link.owner_id, []);
    galleries.get(link.owner_id).push({
      id: item.id,
      url: item.url,
      altText: item.altText,
      width: item.width,
      height: item.height,
      sortOrder: link.sort_order,
      isCover: link.is_cover,
    });
  }
  return galleries;
}

/** Map of id -> public media DTO for ready public assets (missing ids are omitted). */
async function getPublicMediaMap(ids, db = pool) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await mediaRepository.findReadyByIds(db, unique);
  return new Map(rows.filter((row) => row.visibility === 'public').map((row) => [row.id, toMedia(row)]));
}

module.exports = {
  initUpload,
  completeUpload,
  getMedia,
  deleteMedia,
  processUploaded,
  storeGeneratedDocument,
  purgeStaleUploads,
  assertAttachable,
  getForAuthorizedReview,
  buildGalleries,
  getPublicMediaMap,
  registerReferenceCheck,
};
