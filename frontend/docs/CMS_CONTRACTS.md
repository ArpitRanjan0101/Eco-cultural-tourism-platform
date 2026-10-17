# CMS Contracts — section registry, menus and announcements

How the frontend renders backend CMS content. Backend source: `backend/src/modules/cms/cms.sections.js` (input
allowlist), `cms.service.js` (`renderSections`, public serialisation), decisions **B9** and **B14**. Frontend
decisions: **W15**, W37, W38.

| Part | Status |
|------|--------|
| 16 section types, input limits, rendered shapes, rendering rules, menu `linkType` values, announcements | **Confirmed** (backend code, OpenAPI `PublicCmsPage`, `cms-search.test.js`) |
| `src/cms/` registry, schemas, renderer, Markdown, section components; skip-and-log; heading rules; menu hrefs; homepage fallback | **Built** (Phase 4) |
| Admin section editor (`src/cms/editor/`) | Phase 9 |
| Redirects | **Gap** G1 (no public read route) |

## 1. Two shapes per section

| Shape | Who uses it | Where it is defined |
|-------|-------------|---------------------|
| **Input** (`sectionType` + `data`, ids only) | Admin editor → `PUT /admin/cms/pages/:id/sections` | backend `cms.sections.js` (`CmsSectionInput` in OpenAPI) |
| **Rendered** (`type` + `data`, ids resolved to images/cards) | Public pages ← `GET /content/homepage`, `GET /content/pages/:slug` | backend `renderSections()`; OpenAPI types it as an open object (G4), so `src/cms/sectionSchemas.js` is the frontend contract |

Backend rendering rules: only enabled sections, in order; media ids → `Image` `{ id, url, altText, width, height }`
or `null` when missing/private; destination/category/district/supply references → **live public cards**, with
unpublished or suspended items dropped; text is checked (no HTML tags, no `javascript:`/`vbscript:`/`data:`
URLs; links are `/path` or `https://…`).

## 2. Section registry (16 types)

`Image` = `{ id, url, altText|null, width|null, height|null }` · `Cta` = `{ label, href }` · cards as in OpenAPI.
The type list is generated from the contract (`src/cms/sectionTypes.generated.js`); a test fails if the registry,
the schemas or the fixtures miss or add a type.

| `type` | Rendered `data` | Component | Notes |
|--------|-----------------|-----------|-------|
| `hero` | `{ heading, subheading\|null, image\|null, cta\|null }` | `HeroSection` | h1 when first on the homepage, else h2; brand panel without image |
| `rich_text` | `{ heading?, markdown }` | `RichTextSection` | restricted Markdown (§3) |
| `featured_destinations` | `{ heading, destinations: DestinationCard[] }` | `DestinationGridSection` | |
| `category_grid` | `{ heading, categories: DestinationCategory[] }` | `CategoryGridSection` | → `/destinations?category=<slug>` |
| `district_grid` | `{ heading, districts: District[] }` | `DistrictExplorerSection` | → `/districts/<slug>` |
| `image_gallery` | `{ heading\|null, items: [{ image, caption\|null }] }` | `ImageGallerySection` | lightbox |
| `cta_banner` | `{ heading, text, image\|null, cta }` | `CTABannerSection` | |
| `faq` | `{ heading?, items: [{ question, answer }] }` | `FAQSection` | accordion |
| `home_search` (B14) | `{ heading, subheading\|null, placeholder\|null }` | `HomeSearchSection` | plain GET form → `/search?q=` (works without JS) |
| `featured_stays` (B14) | `{ heading, properties: PropertyCard[] }` | `FeaturedStaysSection` | API starting price; live price on the stay page |
| `experience_grid` (B14) | `{ heading, experiences: ExperienceCard[] }` | `ExperienceGridSection` | "No upcoming sessions" when the API has no price |
| `guide_spotlight` (B14) | `{ heading, guides: GuideCard[] }` | `GuideSpotlightSection` | → `/guides/<id>` |
| `package_showcase` (B14) | `{ heading, packages: PackageCard[] }` | `PackageShowcaseSection` | next departure as a calendar date |
| `image_text` (B14) | `{ heading, markdown, image\|null, imagePosition: start\|end, cta\|null }` | `ImageTextSection` | |
| `statistics_strip` (B14) | `{ heading\|null, items: [{ value, label }] }` (1–6) | `StatisticsStripSection` | editor-typed figures shown as entered; never computed |
| `cultural_highlights` (B14) | `{ heading, intro\|null, items: [{ title, text, image\|null, cta\|null }] }` (1–8) | `CulturalHighlightsSection` | |

Live-card sections (`featured_*`, `*_grid` with cards, `guide_spotlight`, `package_showcase`) render **nothing**
when the backend returns no public items. B14 supply input: `source: 'latest' | 'manual'`, `limit` 1–12
(default 6), manual id lists of 1–12 publicly listed items.

## 3. Renderer and safety (`src/cms/`)

| File | Role |
|------|------|
| `sectionTypes.generated.js` | backend type list (generated with the BFF allowlist, W24) |
| `sectionSchemas.js` | Zod schemas of the rendered shapes + `publicPageSchema` |
| `sectionRegistry.js` | `{ type: { schema, Component } }` — the only approved sections |
| `SectionRenderer.jsx` | Server Component: registry lookup (own keys only) → `safeParse` → component; unknown or invalid sections are skipped and logged (`cms.section_skipped`) |
| `DynamicPageRenderer.jsx` | CMS page: title h1 + breadcrumbs + sections |
| `Markdown.jsx` | react-markdown 10 (WO3): `skipHtml`, element allowlist (no images, no raw HTML), headings shifted below the section h2, links re-checked (`/path` or `https`), external links new tab + announced |
| `links.js` | `isSafeHref`, menu `href` builder, `toNavItems` (drops unsafe items, depth ≤ 3) |
| `adapters/cms.adapter.js` | server-only reads: homepage, page by slug (slug-checked), menus, announcements |

No `dangerouslySetInnerHTML` anywhere in `src/cms/`.

## 4. Pages, menus and announcements

| Route | Frontend use |
|-------|--------------|
| `GET /content/homepage` | `/`. 404 → content-free fallback (site name, purpose, links to sections) |
| `GET /content/pages/:slug` | `/pages/[slug]`; draft/archived/unknown → real 404 |
| `GET /content/menus/:code` | header `main` and footer `footer` (`config/site.js`); missing/failed → fallback links to the site's sections (G5) |
| `GET /content/announcements` | notice bar above the header; failures → none shown |

Caching (W38): public CMS reads are fetch-cached for **60 s** (announcements 30 s, tag `cms`); the public layout is
dynamic because the header shows the signed-in user. Published edits appear within a minute; the Phase 9 editor
should revalidate the `cms` tag after saving.

Menu item `href` by `linkType`: `internal` `/path` · `external` `https://…` (new tab) · `page` → `/pages/<slug>` ·
`destination` → `/destinations/<slug>` · `district` → `/districts/<slug>` · `category` →
`/destinations?category=<slug>`. Footer: top-level items with children become titled columns.
