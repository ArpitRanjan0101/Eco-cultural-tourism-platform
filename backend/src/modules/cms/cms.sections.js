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

/**
 * Live supply cards (B14): `latest` lists the newest publicly listed items, `manual` the chosen ids in order.
 * Only published supply of approved partners is ever rendered.
 */
const supplySection = (idsKey) =>
  z
    .object({
      heading,
      source: z.enum(['latest', 'manual']),
      [idsKey]: f.uniqueIds({ min: 1, max: 12 }).optional(),
      limit: z.number().int().min(1).max(12).default(6),
    })
    .strict()
    .refine((data) => data.source !== 'manual' || data[idsKey], { message: `${idsKey} is required for manual source`, path: [idsKey] });

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
  // B14: homepage sections added for the public website.
  home_search: z.object({ heading, subheading: safeText(300).optional(), placeholder: safeText(80).optional() }).strict(),
  featured_stays: supplySection('propertyIds'),
  experience_grid: supplySection('experienceIds'),
  guide_spotlight: supplySection('guideIds'),
  package_showcase: supplySection('packageIds'),
  image_text: z
    .object({ heading, markdown: safeText(5000), mediaId: f.uuid, imagePosition: z.enum(['start', 'end']).default('start'), cta: cta.optional() })
    .strict(),
  // Curated figures typed by an editor (not computed); shown as entered.
  statistics_strip: z
    .object({
      heading: heading.optional(),
      items: z.array(z.object({ value: safeText(24), label: safeText(80) }).strict()).min(1).max(6),
    })
    .strict(),
  cultural_highlights: z
    .object({
      heading,
      intro: safeText(500).optional(),
      items: z
        .array(z.object({ title: safeText(120), text: safeText(600), mediaId: f.uuid.optional(), cta: cta.optional() }).strict())
        .min(1)
        .max(8),
    })
    .strict(),
};

/** Supply section type → the key of its id list, which is also its reference bucket (B14). */
const SUPPLY_REFERENCES = {
  featured_stays: 'propertyIds',
  experience_grid: 'experienceIds',
  guide_spotlight: 'guideIds',
  package_showcase: 'packageIds',
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
  const refs = { mediaIds: [], destinationIds: [], categoryIds: [], propertyIds: [], experienceIds: [], guideIds: [], packageIds: [] };
  for (const { sectionType, data } of sections) {
    if (data.mediaId) refs.mediaIds.push(data.mediaId);
    if (sectionType === 'image_gallery') refs.mediaIds.push(...data.items.map((item) => item.mediaId));
    if (sectionType === 'cultural_highlights') refs.mediaIds.push(...data.items.map((item) => item.mediaId).filter(Boolean));
    if (sectionType === 'featured_destinations' && data.destinationIds) refs.destinationIds.push(...data.destinationIds);
    if (sectionType === 'category_grid' && data.categoryIds) refs.categoryIds.push(...data.categoryIds);
    const supplyKey = SUPPLY_REFERENCES[sectionType];
    if (supplyKey && data[supplyKey]) refs[supplyKey].push(...data[supplyKey]);
  }
  return Object.fromEntries(Object.entries(refs).map(([key, ids]) => [key, [...new Set(ids)]]));
}

module.exports = { SECTION_TYPES, SUPPLY_REFERENCES, sectionInput, collectReferences, safeText };
