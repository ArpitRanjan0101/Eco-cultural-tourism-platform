'use strict';

const { pool } = require('../../config/database');
const { diff } = require('../../core/database/sql');
const ApiError = require('../../core/errors/ApiError');
const { pageMeta } = require('../../core/utils/pagination');
const { slugify } = require('../../core/utils/slug');
const auditService = require('../audit/audit.service');
const mediaService = require('../media/media.service');
const destinationsService = require('../destinations/destinations.service');
const geographyService = require('../geography/geography.service');
const repository = require('./cms.repository');
const { collectReferences } = require('./cms.sections');

// CMS JSON references media ids without a foreign key; block deleting media still in use.
mediaService.registerReferenceCheck((db, mediaId) => repository.sectionsReferenceMedia(db, mediaId));

const iso = (value) => (value ? value.toISOString() : null);
const pageNotFound = () => ApiError.notFound('Page not found', 'PAGE_NOT_FOUND');

function toPage(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    pageType: row.page_type,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    status: row.status,
    publishedAt: iso(row.published_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const toSection = (row) => ({ id: row.id, sectionType: row.section_type, data: row.section_data, sortOrder: row.sort_order, isEnabled: row.is_enabled });

const toImage = (media) => (media ? { id: media.id, url: media.url, altText: media.altText, width: media.width, height: media.height } : null);

/**
 * Serialises enabled sections for public display: media ids become image objects,
 * destination/category/district references become live published cards. Missing or
 * unpublished references are dropped rather than exposed.
 */
async function renderSections(rows) {
  const sections = rows.map((row) => ({ id: row.id, sectionType: row.section_type, data: row.section_data }));
  const refs = collectReferences(sections);
  const media = await mediaService.getPublicMediaMap(refs.mediaIds);

  return Promise.all(
    sections.map(async ({ id, sectionType, data }) => {
      let rendered;
      switch (sectionType) {
        case 'hero':
          rendered = { heading: data.heading, subheading: data.subheading ?? null, image: toImage(media.get(data.mediaId)), cta: data.cta ?? null };
          break;
        case 'cta_banner':
          rendered = { heading: data.heading, text: data.text, image: toImage(media.get(data.mediaId)), cta: data.cta };
          break;
        case 'image_gallery':
          rendered = {
            heading: data.heading ?? null,
            items: data.items.filter((item) => media.has(item.mediaId)).map((item) => ({ image: toImage(media.get(item.mediaId)), caption: item.caption ?? null })),
          };
          break;
        case 'featured_destinations':
          rendered = {
            heading: data.heading,
            destinations:
              data.source === 'manual'
                ? await destinationsService.getPublishedCards(data.destinationIds)
                : await destinationsService.listFeatured({ limit: data.limit }),
          };
          break;
        case 'category_grid':
          rendered = {
            heading: data.heading,
            categories: data.categoryIds
              ? await destinationsService.getActiveCategoriesByIds(data.categoryIds)
              : await destinationsService.listPublicCategories(),
          };
          break;
        case 'district_grid':
          rendered = { heading: data.heading, districts: await geographyService.listPublicDistricts({ region: data.regionSlug }) };
          break;
        default:
          rendered = data; // rich_text, faq: already validated plain content
      }
      return { id, type: sectionType, data: rendered };
    }),
  );
}

async function toPublicPage(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    pageType: row.page_type,
    seo: { title: row.seo_title ?? row.title, description: row.seo_description },
    publishedAt: iso(row.published_at),
    sections: await renderSections(await repository.listSections(pool, row.id, { enabledOnly: true })),
  };
}

// ---- Public ----

async function getPublishedPage(slug) {
  const row = await repository.findPage(pool, { slug });
  if (!row || row.status !== 'published') throw pageNotFound();
  return toPublicPage(row);
}

async function getHomepage() {
  const row = await repository.findPage(pool, { pageType: 'homepage' });
  if (!row || row.status !== 'published') throw pageNotFound();
  return toPublicPage(row);
}

function buildTree(items, { publicOnly }) {
  const visible = publicOnly ? items.filter((item) => item.is_enabled) : items;
  const byParent = new Map();
  for (const item of visible) {
    const key = item.parent_id ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  // Children of a disabled item are unreachable from the root and therefore hidden publicly.
  const build = (parentKey) =>
    (byParent.get(parentKey) ?? []).map((item) => {
      const node = { id: item.id, label: item.label, linkType: item.link_type, linkValue: item.link_value, children: build(item.id) };
      if (!publicOnly) node.isEnabled = item.is_enabled;
      return node;
    });
  return build('root');
}

async function getPublicMenu(code) {
  const menu = await repository.findMenu(pool, { code });
  if (!menu || menu.status !== 'active') throw ApiError.notFound('Menu not found', 'MENU_NOT_FOUND');
  const items = await repository.listMenuItems(pool, [menu.id]);
  return { code: menu.code, name: menu.name, items: buildTree(items, { publicOnly: true }) };
}

const toAnnouncement = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  link: row.link,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
  status: row.status,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

async function getActiveAnnouncements() {
  return (await repository.listActiveAnnouncements(pool)).map(({ id, title, message, link, starts_at, ends_at }) => ({
    id,
    title,
    message,
    link,
    startsAt: iso(starts_at),
    endsAt: iso(ends_at),
  }));
}

// ---- Admin: pages ----

async function requirePage(db, id, options) {
  const row = await repository.findPage(db, { id }, options);
  if (!row) throw pageNotFound();
  return row;
}

async function listPages(query) {
  const { rows, total } = await repository.listPages(pool, query);
  return { items: rows.map(toPage), meta: pageMeta(query, total) };
}

async function getPage(id) {
  const row = await requirePage(pool, id);
  return { ...toPage(row), sections: (await repository.listSections(pool, id)).map(toSection) };
}

async function createPage(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'cms_page', async (client) => {
    const values = { ...input, slug: input.slug ?? slugify(input.title) };
    if (values.pageType === 'homepage' && (await repository.findPage(client, { pageType: 'homepage' }))) {
      throw ApiError.conflict('A homepage already exists', 'HOMEPAGE_EXISTS');
    }
    return { entityId: await repository.insertPage(client, values), action: 'cms.page_created', newValues: values };
  });
  return getPage(id);
}

async function updatePage(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'cms_page', async (client) => {
    const before = toPage(await requirePage(client, id, { forUpdate: true }));
    await repository.updatePage(client, id, changes);
    return { entityId: id, action: 'cms.page_updated', ...diff(before, changes) };
  });
  return getPage(id);
}

/** Validates every id referenced by the sections before replacing them atomically. */
async function replaceSections(ctx, id, { sections }) {
  await auditService.auditedTransaction(ctx, 'cms_page', async (client) => {
    await requirePage(client, id, { forUpdate: true });
    const refs = collectReferences(sections);
    for (const mediaId of refs.mediaIds) {
      await mediaService.assertAttachable(client, ctx, mediaId, { purposes: ['content_image'] });
    }
    await destinationsService.assertDestinationsExist(client, refs.destinationIds, 'sections');
    await destinationsService.assertCategoriesExist(client, refs.categoryIds, 'sections');
    const before = await repository.listSections(client, id);
    await repository.replaceSections(client, id, sections);
    return {
      entityId: id,
      action: 'cms.page_sections_replaced',
      oldValues: { sectionTypes: before.map((s) => s.section_type) },
      newValues: { sectionTypes: sections.map((s) => s.sectionType) },
    };
  });
  return getPage(id);
}

async function setPageStatus(ctx, id, { status }) {
  await auditService.auditedTransaction(ctx, 'cms_page', async (client) => {
    const before = await requirePage(client, id, { forUpdate: true });
    await repository.setPageStatus(client, id, status);
    return { entityId: id, action: 'cms.page_status_changed', ...diff({ status: before.status }, { status }) };
  });
  return getPage(id);
}

async function archivePage(ctx, id) {
  await setPageStatus(ctx, id, { status: 'archived' });
}

// ---- Admin: menus ----

async function listMenus() {
  const menus = await repository.listMenus(pool);
  const items = await repository.listMenuItems(pool, menus.map((menu) => menu.id));
  return menus.map((menu) => ({
    id: menu.id,
    code: menu.code,
    name: menu.name,
    status: menu.status,
    items: buildTree(items.filter((item) => item.menu_id === menu.id), { publicOnly: false }),
    createdAt: iso(menu.created_at),
    updatedAt: iso(menu.updated_at),
  }));
}

async function createMenu(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'cms_menu', async (client) => ({
    entityId: await repository.insertMenu(client, input),
    action: 'cms.menu_created',
    newValues: input,
  }));
  return (await listMenus()).find((menu) => menu.id === id);
}

async function replaceMenuItems(ctx, id, { items }) {
  await auditService.auditedTransaction(ctx, 'cms_menu', async (client) => {
    const menu = await repository.findMenu(client, { id }, { forUpdate: true });
    if (!menu) throw ApiError.notFound('Menu not found', 'MENU_NOT_FOUND');
    await repository.replaceMenuItems(client, id, items);
    return { entityId: id, action: 'cms.menu_items_replaced', newValues: { topLevelItems: items.length } };
  });
  return (await listMenus()).find((menu) => menu.id === id);
}

// ---- Admin: redirects ----

const toRedirect = (row) => ({
  id: row.id,
  sourcePath: row.source_path,
  targetPath: row.target_path,
  statusCode: row.status_code,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

async function listRedirects() {
  return (await repository.listRedirects(pool)).map(toRedirect);
}

async function createRedirect(ctx, input) {
  let created;
  await auditService.auditedTransaction(ctx, 'cms_redirect', async (client) => {
    created = await repository.insertRedirect(client, input);
    return { entityId: created.id, action: 'cms.redirect_created', newValues: input };
  });
  return toRedirect(created);
}

async function deleteRedirect(ctx, id) {
  await auditService.auditedTransaction(ctx, 'cms_redirect', async (client) => {
    const removed = await repository.deleteRedirect(client, id);
    if (!removed) throw ApiError.notFound('Redirect not found', 'REDIRECT_NOT_FOUND');
    return { entityId: id, action: 'cms.redirect_deleted', oldValues: toRedirect(removed), newValues: { deleted: true } };
  });
}

// ---- Admin: announcements ----

async function requireAnnouncement(db, id, options) {
  const row = await repository.findAnnouncement(db, id, options);
  if (!row) throw ApiError.notFound('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND');
  return row;
}

async function listAnnouncements(query) {
  return (await repository.listAnnouncements(pool, query)).map(toAnnouncement);
}

async function createAnnouncement(ctx, input) {
  const id = await auditService.auditedTransaction(ctx, 'cms_announcement', async (client) => ({
    entityId: await repository.insertAnnouncement(client, input),
    action: 'cms.announcement_created',
    newValues: input,
  }));
  return toAnnouncement(await requireAnnouncement(pool, id));
}

async function updateAnnouncement(ctx, id, changes) {
  await auditService.auditedTransaction(ctx, 'cms_announcement', async (client) => {
    const before = toAnnouncement(await requireAnnouncement(client, id, { forUpdate: true }));
    const startsAt = changes.startsAt ?? before.startsAt;
    const endsAt = changes.endsAt ?? before.endsAt;
    if (new Date(endsAt) <= new Date(startsAt)) {
      throw ApiError.validation([{ location: 'body', path: 'endsAt', message: 'endsAt must be after startsAt' }]);
    }
    await repository.updateAnnouncement(client, id, changes);
    return { entityId: id, action: 'cms.announcement_updated', ...diff(before, changes) };
  });
  return toAnnouncement(await requireAnnouncement(pool, id));
}

async function deleteAnnouncement(ctx, id) {
  await auditService.auditedTransaction(ctx, 'cms_announcement', async (client) => {
    const before = await requireAnnouncement(client, id, { forUpdate: true });
    await repository.deleteAnnouncement(client, id);
    return { entityId: id, action: 'cms.announcement_deleted', oldValues: toAnnouncement(before), newValues: { deleted: true } };
  });
}

module.exports = {
  getPublishedPage,
  getHomepage,
  getPublicMenu,
  getActiveAnnouncements,
  listPages,
  getPage,
  createPage,
  updatePage,
  replaceSections,
  setPageStatus,
  archivePage,
  listMenus,
  createMenu,
  replaceMenuItems,
  listRedirects,
  createRedirect,
  deleteRedirect,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
