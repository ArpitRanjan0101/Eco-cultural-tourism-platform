# CMS Contracts — section registry, menus and announcements

How the frontend renders backend CMS content. Backend source: `backend/src/modules/cms/cms.sections.js`
(input allowlist), `cms.service.js` (`renderSections`, public serialisation) and decision **B9**. Frontend
decision: **W15**. If the backend registry changes, this file, `src/cms/sectionSchemas.js` and
`src/cms/sectionRegistry.js` change together.

**Status of this document:**

| Part | Status |
|------|--------|
| 8 section types, input limits, rendered shapes, rendering rules, menu `linkType` values, announcement fields | **Confirmed** from backend code and OpenAPI |
| Component names, `src/cms/` files, skip-and-log behaviour, hero `h1` rule, menu `href` construction, homepage fallback | **Proposed** (frontend design) |
| New section types | **None proposed.** A new type needs a backend registry change first (B9); the frontend registry only mirrors it |
| Redirects | **Gap** G1 |

## 1. Two shapes per section

| Shape | Who uses it | Where it is defined |
|-------|-------------|---------------------|
| **Input** (`sectionType` + `data`, ids only) | Admin CMS editor → `PUT /admin/cms/pages/:id/sections` | backend `cms.sections.js` (`CmsSectionInput` in OpenAPI) |
| **Rendered** (`type` + `data`, ids resolved to images/cards) | Public pages ← `GET /content/homepage`, `GET /content/pages/:slug` | backend `renderSections()`; OpenAPI types it only as an open object, so the frontend schemas below are the contract |

Rendering rules applied by the backend before the frontend sees anything:
- Only enabled sections, in `sort_order`.
- Media ids become `Image` objects `{ id, url, altText, width, height }`, or `null` when the media is missing or not public.
- Destination, category and district references become **live published** cards; missing or unpublished references are dropped.
- Text has already been checked: no HTML tags, no `javascript:` / `vbscript:` / `data:` URLs; links are `/path` or `https://…`.

## 2. Section registry (8 types)

`Image` = `{ id, url, altText|null, width|null, height|null }` · `Cta` = `{ label, href }` · cards as named in OpenAPI.

| `type` | Rendered `data` | Component (planned) | Frontend rules |
|--------|-----------------|---------------------|----------------|
| `hero` | `{ heading, subheading\|null, image: Image\|null, cta: Cta\|null }` | `HeroSection` | `image` null → text-only hero variant; heading is the page `h1` only on the first section |
| `rich_text` | `{ heading?, markdown }` | `RichTextSection` | Restricted Markdown (WO3): no raw HTML, links pass the same `/path` / `https://` check again, external links `rel="noopener noreferrer"` |
| `featured_destinations` | `{ heading, destinations: DestinationCard[] }` | `FeaturedDestinationsSection` | Empty list → section not rendered |
| `category_grid` | `{ heading, categories: DestinationCategory[] }` | `CategoryGridSection` | Each links to `/destinations?category=<slug>` (`category` query exists on `GET /destinations`) |
| `district_grid` | `{ heading, districts: District[] }` | `DistrictGridSection` | Each links to `/districts/<slug>` |
| `image_gallery` | `{ heading\|null, items: [{ image: Image, caption\|null }] }` | `ImageGallerySection` | Items without an image are already removed by the backend; `altText` null → caption, else empty alt (decorative) |
| `cta_banner` | `{ heading, text, image: Image\|null, cta: Cta }` | `CtaBannerSection` | — |
| `faq` | `{ heading?, items: [{ question, answer }] }` | `FaqSection` | Disclosure pattern (`details`/`summary`); plain text answers |

Input-side limits the editor must mirror (from `cms.sections.js`): heading ≤150, subheading ≤300, CTA label ≤60,
rich text ≤20000, gallery 1–24 items (caption ≤200), FAQ 1–30 items (question ≤300, answer ≤3000),
`featured_destinations.source` `featured` (with `limit` 1–12, default 6) or `manual` (1–12 `destinationIds`),
`category_grid.categoryIds` 1–24 optional, `district_grid.regionSlug` optional, `cta_banner.text` ≤500.

## 3. Renderer contract (`src/cms/`)

```
sectionSchemas.js    Zod schema per rendered type (shapes in §2)
sectionRegistry.js   { [type]: { schema, Component } } — the only place a type is approved
SectionRenderer.jsx  Server Component: for each section → registry lookup → schema.safeParse → <Component {...data} />
sections/            one component per type, props-driven, no data fetching
editor/              admin editor forms per type (Phase 9), built on the input schema
```

- Unknown `type`, or rendered data failing its schema → section skipped, server log with page slug, section id
  and type. The rest of the page renders.
- No `dangerouslySetInnerHTML` in `src/cms/` (enforced by lint rule in Phase 4).
- Page metadata from `seo.title` / `seo.description`; `publishedAt` feeds the sitemap.

## 4. Pages, menus and announcements

| Route | Frontend use |
|-------|--------------|
| `GET /content/homepage` | `/` — one homepage document (backend unique index). 404 → homepage falls back to a static, content-free layout that links to destinations; nothing fabricated |
| `GET /content/pages/:slug` | `/pages/[slug]`; `pageType` `landing` or `static`; 404 → `not-found` |
| `GET /content/menus/:code` | Header and footer navigation. Menu codes are created by admins; the codes used by the layout are configuration (`config/site.js`), agreed in Phase 4 |
| `GET /content/announcements` | Site-wide notice bar: active window only, `{ id, title, message, link\|null, startsAt, endsAt }` |

Menu item `href` by `linkType` (max depth 3):

| `linkType` | `linkValue` | `href` |
|------------|-------------|--------|
| `internal` | path starting with `/` | as is |
| `external` | `https://…` URL | as is, opened with `rel="noopener noreferrer"` |
| `page` | slug | `/pages/<slug>` |
| `destination` | slug | `/destinations/<slug>` |
| `district` | slug | `/districts/<slug>` |
| `category` | slug | `/destinations?category=<slug>` |

**Redirects** (`cms_redirects`) are readable only through admin routes, so the public site cannot apply them
yet (backend O8, frontend WO8).
