import { z } from 'zod';
import { isSafeHref } from './links';

// Zod schemas of the RENDERED section data the public API returns (backend cms.service.js renderSections;
// OpenAPI types it only as an open object, gap G4). Every section is validated before it reaches a component
// (W15); object schemas strip unknown keys, so components receive exactly these fields.

const text = z.string().min(1);
const optionalText = z.string().min(1).nullable().optional();
const href = z.string().refine(isSafeHref, 'unsafe link');
const cta = z.object({ label: text, href });
const id = z.string().min(1);

export const imageSchema = z.object({
  id,
  url: z.url({ protocol: /^https?$/ }),
  altText: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
const image = imageSchema.nullable();
const ref = z.object({ id, name: text, slug: text });
const money = z.string().nullable();

export const destinationCardSchema = z.object({
  id,
  name: text,
  slug: text,
  summary: z.string().nullable(),
  entryFee: money,
  district: z.object({ id, name: text, slug: text }).nullable(),
  coverImage: image,
  categories: z.array(ref),
});

export const propertyCardSchema = z.object({
  id,
  name: text,
  slug: text,
  propertyType: text,
  bookingMode: z.enum(['instant', 'request']),
  startingPrice: money,
  currency: text,
  district: z.object({ id, name: text, slug: text }).nullable(),
  coverImage: image,
});

export const experienceCardSchema = z.object({
  id,
  name: text,
  slug: text,
  durationMinutes: z.number().int(),
  bookingMode: z.enum(['instant', 'request']),
  startingPrice: money,
  currency: text,
  nextSessionAt: z.string().nullable(),
  destination: ref.nullable(),
  coverImage: image,
});

export const guideCardSchema = z.object({
  id,
  displayName: text,
  yearsExperience: z.number().int(),
  startingPrice: money,
  currency: text,
  photo: image,
  languages: z.array(z.object({ id, code: text, name: text })),
  destinations: z.array(ref),
});

export const packageCardSchema = z.object({
  id,
  name: text,
  slug: text,
  summary: z.string().nullable(),
  durationDays: z.number().int(),
  durationNights: z.number().int(),
  startingPrice: money,
  currency: text,
  nextDeparture: z.string().nullable(),
  coverImage: image,
});

const categorySchema = z.object({ id, name: text, slug: text, description: z.string().nullable(), icon: z.string().nullable() });
const districtSchema = z.object({ id, name: text, slug: text, description: z.string().nullable(), region: ref });

export const SECTION_SCHEMAS = {
  hero: z.object({ heading: text, subheading: optionalText, image, cta: cta.nullable() }),
  rich_text: z.object({ heading: optionalText, markdown: text }),
  featured_destinations: z.object({ heading: text, destinations: z.array(destinationCardSchema) }),
  category_grid: z.object({ heading: text, categories: z.array(categorySchema) }),
  district_grid: z.object({ heading: text, districts: z.array(districtSchema) }),
  image_gallery: z.object({ heading: optionalText, items: z.array(z.object({ image: imageSchema, caption: optionalText })) }),
  cta_banner: z.object({ heading: text, text, image, cta }),
  faq: z.object({ heading: optionalText, items: z.array(z.object({ question: text, answer: text })).min(1) }),
  home_search: z.object({ heading: text, subheading: optionalText, placeholder: optionalText }),
  featured_stays: z.object({ heading: text, properties: z.array(propertyCardSchema) }),
  experience_grid: z.object({ heading: text, experiences: z.array(experienceCardSchema) }),
  guide_spotlight: z.object({ heading: text, guides: z.array(guideCardSchema) }),
  package_showcase: z.object({ heading: text, packages: z.array(packageCardSchema) }),
  image_text: z.object({ heading: text, markdown: text, image, imagePosition: z.enum(['start', 'end']), cta: cta.nullable() }),
  statistics_strip: z.object({ heading: optionalText, items: z.array(z.object({ value: text, label: text })).min(1) }),
  cultural_highlights: z.object({
    heading: text,
    intro: optionalText,
    items: z.array(z.object({ title: text, text, image, cta: cta.nullable() })).min(1),
  }),
};

/** Envelope of GET /content/homepage and /content/pages/:slug (PublicCmsPage). Sections are validated one by one. */
export const publicPageSchema = z.object({
  id,
  title: text,
  slug: text,
  pageType: z.enum(['homepage', 'landing', 'static']),
  seo: z.object({ title: text, description: z.string().nullable() }),
  publishedAt: z.string().nullable(),
  sections: z.array(z.object({ id, type: text, data: z.record(z.string(), z.unknown()) })),
});
