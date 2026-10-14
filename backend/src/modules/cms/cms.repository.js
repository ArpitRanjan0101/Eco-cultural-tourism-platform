'use strict';

const { buildUpdate } = require('../../core/database/sql');
const { orderBy, pageWindow, likePattern } = require('../../core/utils/pagination');

// ---- pages ----

const PAGE_COLUMNS = 'p.id, p.title, p.slug, p.page_type, p.seo_title, p.seo_description, p.status, p.published_at, p.created_at, p.updated_at';
const PAGE_SORT = { title: 'p.title', updatedAt: 'p.updated_at', createdAt: 'p.created_at' };

async function listPages(db, { status, pageType, q, sort, page, limit }) {
  const values = [status ?? null, pageType ?? null, q ? likePattern(q) : null];
  const where = `WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.page_type = $2)
                 AND ($3::text IS NULL OR p.title ILIKE $3 OR p.slug ILIKE $3)`;
  const window = pageWindow({ page, limit });
  const [list, count] = await Promise.all([
    db.query(`SELECT ${PAGE_COLUMNS} FROM cms_pages p ${where} ORDER BY ${orderBy(sort, PAGE_SORT, 'p.id')} LIMIT $4 OFFSET $5`, [
      ...values,
      window.limit,
      window.offset,
    ]),
    db.query(`SELECT count(*)::int AS total FROM cms_pages p ${where}`, values),
  ]);
  return { rows: list.rows, total: count.rows[0].total };
}

async function findPage(db, { id, slug, pageType }, { forUpdate = false } = {}) {
  const [condition, value] = id ? ['p.id = $1', id] : slug ? ['p.slug = $1', slug] : ['p.page_type = $1', pageType];
  const { rows } = await db.query(`SELECT ${PAGE_COLUMNS} FROM cms_pages p WHERE ${condition} ${forUpdate ? 'FOR UPDATE' : ''}`, [value]);
  return rows[0] ?? null;
}

async function insertPage(db, { title, slug, pageType, seoTitle, seoDescription }) {
  const { rows } = await db.query(
    'INSERT INTO cms_pages (title, slug, page_type, seo_title, seo_description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [title, slug, pageType, seoTitle ?? null, seoDescription ?? null],
  );
  return rows[0].id;
}

async function updatePage(db, id, fields) {
  const query = buildUpdate('cms_pages', id, fields, { title: 'title', slug: 'slug', seoTitle: 'seo_title', seoDescription: 'seo_description' });
  if (query) await db.query(query.text, query.values);
}

async function setPageStatus(db, id, status) {
  await db.query(
    `UPDATE cms_pages SET status = $2,
       published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END
     WHERE id = $1`,
    [id, status],
  );
}

async function listSections(db, pageId, { enabledOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, section_type, section_data, sort_order, is_enabled FROM cms_page_sections
     WHERE page_id = $1 ${enabledOnly ? 'AND is_enabled' : ''} ORDER BY sort_order`,
    [pageId],
  );
  return rows;
}

async function replaceSections(db, pageId, sections) {
  await db.query('DELETE FROM cms_page_sections WHERE page_id = $1', [pageId]);
  for (const [index, section] of sections.entries()) {
    await db.query(
      'INSERT INTO cms_page_sections (page_id, section_type, section_data, sort_order, is_enabled) VALUES ($1, $2, $3, $4, $5)',
      [pageId, section.sectionType, section.data, index, section.isEnabled],
    );
  }
}

/** True when any section payload contains the media id (used to block media deletion). */
async function sectionsReferenceMedia(db, mediaId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM cms_page_sections WHERE jsonb_path_exists(section_data, '$.** ? (@ == $id)', jsonb_build_object('id', $1::text))
     ) AS referenced`,
    [mediaId],
  );
  return rows[0].referenced;
}

// ---- menus ----

async function listMenus(db) {
  const { rows } = await db.query('SELECT id, code, name, status, created_at, updated_at FROM cms_menus ORDER BY code');
  return rows;
}

async function findMenu(db, { id, code }, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, code, name, status, created_at, updated_at FROM cms_menus WHERE ${id ? 'id = $1' : 'code = $1'} ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id ?? code],
  );
  return rows[0] ?? null;
}

async function insertMenu(db, { code, name }) {
  const { rows } = await db.query('INSERT INTO cms_menus (code, name) VALUES ($1, $2) RETURNING id', [code, name]);
  return rows[0].id;
}

async function listMenuItems(db, menuIds) {
  const { rows } = await db.query(
    `SELECT id, menu_id, parent_id, label, link_type, link_value, sort_order, is_enabled
     FROM cms_menu_items WHERE menu_id = ANY($1::uuid[]) ORDER BY sort_order`,
    [menuIds],
  );
  return rows;
}

async function replaceMenuItems(db, menuId, items) {
  await db.query('DELETE FROM cms_menu_items WHERE menu_id = $1', [menuId]);
  const insert = async (nodes, parentId) => {
    for (const [index, node] of nodes.entries()) {
      const { rows } = await db.query(
        `INSERT INTO cms_menu_items (menu_id, parent_id, label, link_type, link_value, sort_order, is_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [menuId, parentId, node.label, node.linkType, node.linkValue, index, node.isEnabled],
      );
      if (node.children?.length) await insert(node.children, rows[0].id);
    }
  };
  await insert(items, null);
}

// ---- redirects ----

const REDIRECT_COLUMNS = 'id, source_path, target_path, status_code, created_at, updated_at';

async function listRedirects(db) {
  const { rows } = await db.query(`SELECT ${REDIRECT_COLUMNS} FROM cms_redirects ORDER BY source_path`);
  return rows;
}

async function insertRedirect(db, { sourcePath, targetPath, statusCode }) {
  const { rows } = await db.query(
    `INSERT INTO cms_redirects (source_path, target_path, status_code) VALUES ($1, $2, $3) RETURNING ${REDIRECT_COLUMNS}`,
    [sourcePath, targetPath, statusCode],
  );
  return rows[0];
}

async function deleteRedirect(db, id) {
  const { rows } = await db.query(`DELETE FROM cms_redirects WHERE id = $1 RETURNING ${REDIRECT_COLUMNS}`, [id]);
  return rows[0] ?? null;
}

// ---- announcements ----

const ANNOUNCEMENT_COLUMNS = 'id, title, message, link, starts_at, ends_at, status, created_at, updated_at';

async function listAnnouncements(db, { status }) {
  const { rows } = await db.query(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM cms_announcements WHERE ($1::text IS NULL OR status = $1) ORDER BY starts_at DESC, id`,
    [status ?? null],
  );
  return rows;
}

async function listActiveAnnouncements(db) {
  const { rows } = await db.query(
    `SELECT ${ANNOUNCEMENT_COLUMNS} FROM cms_announcements
     WHERE status = 'published' AND starts_at <= now() AND ends_at > now() ORDER BY starts_at DESC, id`,
  );
  return rows;
}

async function findAnnouncement(db, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`SELECT ${ANNOUNCEMENT_COLUMNS} FROM cms_announcements WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] ?? null;
}

async function insertAnnouncement(db, { title, message, link, startsAt, endsAt, status }) {
  const { rows } = await db.query(
    `INSERT INTO cms_announcements (title, message, link, starts_at, ends_at, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, message, link ?? null, startsAt, endsAt, status],
  );
  return rows[0].id;
}

async function updateAnnouncement(db, id, fields) {
  const query = buildUpdate('cms_announcements', id, fields, {
    title: 'title',
    message: 'message',
    link: 'link',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    status: 'status',
  });
  if (query) await db.query(query.text, query.values);
}

async function deleteAnnouncement(db, id) {
  await db.query('DELETE FROM cms_announcements WHERE id = $1', [id]);
}

module.exports = {
  PAGE_SORT,
  listPages,
  findPage,
  insertPage,
  updatePage,
  setPageStatus,
  listSections,
  replaceSections,
  sectionsReferenceMedia,
  listMenus,
  findMenu,
  insertMenu,
  listMenuItems,
  replaceMenuItems,
  listRedirects,
  insertRedirect,
  deleteRedirect,
  listAnnouncements,
  listActiveAnnouncements,
  findAnnouncement,
  insertAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
