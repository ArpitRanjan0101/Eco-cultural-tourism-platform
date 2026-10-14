'use strict';

const { z } = require('../../core/validation/zod');
const f = require('../../core/validation/fields');

/**
 * Allowlisted CMS section registry. Every section_data payload is validated here
 * before it is stored; anything else is rejected. Text is plain text or a
 * restricted Markdown string: raw HTML and script-capable URLs are refused, so no
 * executable payload can be stored (Report §13 "CMS injection").
 */

const UNSAFE_MARKUP = /<\s*[a-z!/?]|javascript:|vbscript:|data:/i;
const safeText = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !UNSAFE_MARKUP.test(value), 'HTML tags and script/data URLs are not allowed');

const heading = safeText(150);
const cta = z.object({ label: safeText(60), href: f.safeHref }).strict();

const SECTION_DATA = {
  hero: z.object({ heading, subheading: safeText(300).optional(), mediaId: f.uuid, cta: cta.optional() }).strict(),
  rich_text: z.object({ heading: heading.optional(), markdown: safeText(20000) }).strict(),
  featured_destinations: z
    .object({
      heading,
      source: z.enum(['featured', 'manual']),
      destinationIds: f.uniqueIds({ min: 1, max: 12 }).optional(),
      limit: z.number().int().min(1).max(12).default(6),
    })
    .strict()
    .refine((data) => data.source !== 'manual' || data.destinationIds, { message: 'destinationIds is required for manual source', path: ['destinationIds'] }),
  category_grid: z.object({ heading, categoryIds: f.uniqueIds({ min: 1, max: 24 }).optional() }).strict(),
  district_grid: z.object({ heading, regionSlug: f.slug.optional() }).strict(),
  image_gallery: z
    .object({
      heading: heading.optional(),
      items: z.array(z.object({ mediaId: f.uuid, caption: safeText(200).optional() }).strict()).min(1).max(24),
    })
    .strict(),
  cta_banner: z.object({ heading, text: safeText(500), mediaId: f.uuid.optional(), cta }).strict(),
  faq: z
    .object({
      heading: heading.optional(),
      items: z.array(z.object({ question: safeText(300), answer: safeText(3000) }).strict()).min(1).max(30),
    })
    .strict(),
};

const SECTION_TYPES = Object.keys(SECTION_DATA);

const sectionInput = z
  .discriminatedUnion(
    'sectionType',
    SECTION_TYPES.map((type) =>
      z.object({ sectionType: z.literal(type), data: SECTION_DATA[type], isEnabled: z.boolean().default(true) }).strict(),
    ),
  )
  .openapi('CmsSectionInput');

/** Every id a section refers to, so the service can verify they exist before saving. */
function collectReferences(sections) {
  const refs = { mediaIds: [], destinationIds: [], categoryIds: [] };
  for (const { sectionType, data } of sections) {
    if (data.mediaId) refs.mediaIds.push(data.mediaId);
    if (sectionType === 'image_gallery') refs.mediaIds.push(...data.items.map((item) => item.mediaId));
    if (sectionType === 'featured_destinations' && data.destinationIds) refs.destinationIds.push(...data.destinationIds);
    if (sectionType === 'category_grid' && data.categoryIds) refs.categoryIds.push(...data.categoryIds);
  }
  return {
    mediaIds: [...new Set(refs.mediaIds)],
    destinationIds: [...new Set(refs.destinationIds)],
    categoryIds: [...new Set(refs.categoryIds)],
  };
}

module.exports = { SECTION_TYPES, sectionInput, collectReferences, safeText };
