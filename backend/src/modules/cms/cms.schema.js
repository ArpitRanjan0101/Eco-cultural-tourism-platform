'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');
const { paginationQuery, sortQuery } = require('../../core/utils/pagination');
const { sectionInput, safeText, SECTION_TYPES } = require('./cms.sections');
const { PAGE_SORT } = require('./cms.repository');

const atLeastOne = (schema) => schema.refine((body) => Object.keys(body).length > 0, 'at least one field is required');
const pageType = z.enum(['homepage', 'landing', 'static']);

// ---- pages ----
const pageFields = { title: safeText(200), slug: f.slug, seoTitle: safeText(200).nullable(), seoDescription: safeText(320).nullable() };
const createPageBody = z.object({ ...pageFields, pageType }).partial().required({ title: true, pageType: true }).strict();
const updatePageBody = atLeastOne(z.object(pageFields).partial().strict());
const sectionsBody = z.object({ sections: z.array(sectionInput).max(30) }).strict();
const pageListQuery = z
  .object({
    ...paginationQuery,
    status: f.publishStatus.optional(),
    pageType: pageType.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: sortQuery(PAGE_SORT, '-updatedAt'),
  })
  .strict();

const pageSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    slug: z.string(),
    pageType,
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable(),
    status: f.publishStatus,
    publishedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('CmsPage');

const adminPageSchema = pageSchema
  .extend({
    sections: z.array(
      z.object({
        id: z.string().uuid(),
        sectionType: z.enum(SECTION_TYPES),
        data: z.record(z.unknown()),
        sortOrder: z.number().int(),
        isEnabled: z.boolean(),
      }),
    ),
  })
  .openapi('CmsPageWithSections');

const publicPageSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    slug: z.string(),
    pageType,
    seo: z.object({ title: z.string(), description: z.string().nullable() }),
    publishedAt: z.string().datetime().nullable(),
    sections: z.array(
      z.object({
        id: z.string().uuid(),
        type: z.enum(SECTION_TYPES),
        data: z.record(z.unknown()).openapi({ description: 'Rendered section: media resolved to images, references to live published cards' }),
      }),
    ),
  })
  .openapi('PublicCmsPage');

// ---- menus (max depth 3) ----
const LINK_TYPES = ['internal', 'external', 'page', 'destination', 'district', 'category'];
const SLUG_LINKS = new Set(['page', 'destination', 'district', 'category']);

function checkLink(item, ctx) {
  const ok =
    item.linkType === 'internal'
      ? /^\/(?!\/)[^\s]*$/.test(item.linkValue)
      : item.linkType === 'external'
        ? /^https:\/\/[^\s]+$/.test(item.linkValue)
        : SLUG_LINKS.has(item.linkType) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.linkValue);
  if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['linkValue'], message: `invalid linkValue for linkType ${item.linkType}` });
}

const itemFields = {
  label: safeText(100),
  linkType: z.enum(LINK_TYPES),
  linkValue: z.string().trim().min(1).max(500),
  isEnabled: z.boolean().default(true),
};
const level3 = z.object(itemFields).strict().superRefine(checkLink);
const level2 = z.object({ ...itemFields, children: z.array(level3).max(20).default([]) }).strict().superRefine(checkLink);
const level1 = z.object({ ...itemFields, children: z.array(level2).max(20).default([]) }).strict().superRefine(checkLink);

const countItems = (items) => items.reduce((total, item) => total + 1 + countItems(item.children ?? []), 0);
const menuItemsBody = z
  .object({ items: z.array(level1).max(30).refine((items) => countItems(items) <= 100, 'a menu may contain at most 100 items') })
  .strict();
const createMenuBody = z.object({ code: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/), name: safeText(100) }).strict();
const menuCodeParams = z.object({ code: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/) });

const menuNode = z.object({
  id: z.string().uuid(),
  label: z.string(),
  linkType: z.enum(LINK_TYPES),
  linkValue: z.string(),
  isEnabled: z.boolean().optional(),
  children: z.array(z.record(z.unknown())).openapi({ description: 'Nested menu nodes (same shape), max depth 3' }),
});
const publicMenuSchema = z.object({ code: z.string(), name: z.string(), items: z.array(menuNode) }).openapi('PublicMenu');
const adminMenuSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    status: f.activeStatus,
    items: z.array(menuNode),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('CmsMenu');

// ---- redirects ----
const createRedirectBody = z
  .object({
    sourcePath: z.string().trim().max(500).regex(/^\/[A-Za-z0-9._~/%-]*$/, 'sourcePath must be a site path starting with "/"'),
    targetPath: f.safeHref,
    statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(301),
  })
  .strict()
  .refine((body) => body.sourcePath !== body.targetPath, { message: 'targetPath must differ from sourcePath', path: ['targetPath'] });
const redirectSchema = z
  .object({
    id: z.string().uuid(),
    sourcePath: z.string(),
    targetPath: z.string(),
    statusCode: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('CmsRedirect');

// ---- announcements ----
const announcementFields = {
  title: safeText(150),
  message: safeText(1000),
  link: f.safeHref.nullable(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: f.publishStatus,
};
const createAnnouncementBody = z
  .object(announcementFields)
  .partial({ link: true, status: true })
  .strict()
  .refine((body) => new Date(body.endsAt) > new Date(body.startsAt), { message: 'endsAt must be after startsAt', path: ['endsAt'] })
  .transform((body) => ({ status: 'draft', ...body }));
const updateAnnouncementBody = atLeastOne(z.object(announcementFields).partial().strict());
const announcementListQuery = z.object({ status: f.publishStatus.optional() }).strict();
const announcementSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    message: z.string(),
    link: z.string().nullable(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    status: f.publishStatus,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('CmsAnnouncement');
const publicAnnouncementSchema = announcementSchema.pick({ id: true, title: true, message: true, link: true, startsAt: true, endsAt: true });

module.exports = {
  createPageBody,
  updatePageBody,
  sectionsBody,
  pageListQuery,
  pageSchema,
  adminPageSchema,
  publicPageSchema,
  menuItemsBody,
  createMenuBody,
  menuCodeParams,
  publicMenuSchema,
  adminMenuSchema,
  createRedirectBody,
  redirectSchema,
  createAnnouncementBody,
  updateAnnouncementBody,
  announcementListQuery,
  announcementSchema,
  publicAnnouncementSchema,
};
