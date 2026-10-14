'use strict';

const {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('./index');

const { storage } = config;

const baseOptions = {
  region: storage.region,
  credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
  forcePathStyle: storage.forcePathStyle,
};

// Server-side operations use the private endpoint; URLs handed to browsers are signed for the public one.
const internalClient = new S3Client({ ...baseOptions, endpoint: storage.endpoint });
const presignClient = new S3Client({ ...baseOptions, endpoint: storage.publicEndpoint });

const bucketFor = (visibility) => (visibility === 'public' ? storage.publicBucket : storage.privateBucket);

/** Presigned PUT; Content-Type and Content-Length are signed so the client cannot change them. */
function presignUpload({ visibility, key, contentType, contentLength, expiresIn }) {
  const command = new PutObjectCommand({
    Bucket: bucketFor(visibility),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(presignClient, command, { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) });
}

function presignDownload({ visibility, key, expiresIn }) {
  return getSignedUrl(presignClient, new GetObjectCommand({ Bucket: bucketFor(visibility), Key: key }), { expiresIn });
}

/** Returns { contentLength, contentType } or null when the object does not exist. */
async function headObject({ visibility, key }) {
  try {
    const result = await internalClient.send(new HeadObjectCommand({ Bucket: bucketFor(visibility), Key: key }));
    return { contentLength: Number(result.ContentLength), contentType: result.ContentType };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Reads the first `bytes` bytes (file signature sniffing). */
async function readPrefix({ visibility, key }, bytes = 16) {
  const result = await internalClient.send(
    new GetObjectCommand({ Bucket: bucketFor(visibility), Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  return Buffer.from(await result.Body.transformToByteArray());
}

async function deleteObject({ visibility, key }) {
  await internalClient.send(new DeleteObjectCommand({ Bucket: bucketFor(visibility), Key: key }));
}

const publicUrl = (key) => `${storage.publicBaseUrl}/${key}`;

async function checkBuckets() {
  await Promise.all(
    [storage.publicBucket, storage.privateBucket].map((bucket) => internalClient.send(new HeadBucketCommand({ Bucket: bucket }))),
  );
}

/** Idempotently creates both buckets (run by `npm run storage:init`). */
async function ensureBuckets() {
  const created = [];
  for (const bucket of [storage.publicBucket, storage.privateBucket]) {
    try {
      await internalClient.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await internalClient.send(new CreateBucketCommand({ Bucket: bucket }));
      created.push(bucket);
    }
  }
  return created;
}

module.exports = { presignUpload, presignDownload, headObject, readPrefix, deleteObject, publicUrl, checkBuckets, ensureBuckets };
