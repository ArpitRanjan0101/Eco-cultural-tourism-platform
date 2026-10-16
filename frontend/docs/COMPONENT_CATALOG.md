# Component Catalog

Every shared component, its props and documented variants (W20). A component is listed as **built** only when
it exists, uses design tokens only, has component tests (including keyboard/labels, W21) and passes them in
Docker. Feature components are listed under their feature when built.

Status: `planned` (designed, not built) · `built` (implemented and tested) · `changed` (contract changed since last review).

**Phase 0:** inventory only. Nothing is built yet; props and variants are proposals reviewed in Phase 2.

## Design tokens (Phase 2)

| Group | Tokens (proposed names) | Notes |
|-------|-------------------------|-------|
| Colour | `primary` (forest), `secondary` (earth), `accent` (sky), `neutral-50…950`, `success`, `warning`, `danger`, `info`, `surface`, `surface-muted`, `text`, `text-muted`, `border`, `focus` | Brand values pending WO5; every text/surface pair checked for AA contrast |
| Type | `display`, `h1`–`h4`, `body-lg`, `body`, `body-sm`, `caption`; font families `sans`, `display` | Self-hosted via `next/font` |
| Space | Tailwind default 4 px scale | No arbitrary values in feature code |
| Radius | `sm`, `md`, `lg`, `full` | |
| Shadow | `sm`, `md`, `lg` | |
| Motion | `fast` 120 ms, `base` 200 ms, `slow` 320 ms | Disabled under `prefers-reduced-motion` |
| Breakpoints | `sm` 640, `md` 768, `lg` 1024, `xl` 1280 | Mobile-first |

## `components/ui` — primitives

| Component | Key props | Variants / sizes | Status |
|-----------|-----------|------------------|--------|
| `Button` | `variant`, `size`, `loading`, `disabled`, `asChild`-style `href` | `primary`, `secondary`, `outline`, `ghost`, `danger` · `sm`, `md`, `lg` | planned |
| `IconButton` | `label` (required, accessible name), `variant`, `size` | as Button | planned |
| `Link` | `href`, `external` | `inline`, `standalone` | planned |
| `Badge` | `tone` | `neutral`, `success`, `warning`, `danger`, `info` | planned |
| `StatusBadge` | `status`, `domain` | maps backend status enums (booking, payment, refund, moderation, partner, review) to tone + label | planned |
| `Card` | `as`, `padding` | `plain`, `elevated`, `outlined` | planned |
| `Avatar` | `image`, `name`, `size` | `sm`, `md`, `lg` | planned |
| `Spinner`, `Skeleton` | `size` / `shape` | | planned |
| `Tabs` | `items`, `value`, `onChange` | | planned |
| `Dialog`, `Drawer` | `open`, `onClose`, `title` | focus trap, `Esc` closes | planned |
| `Tooltip` | `content` | | planned |
| `Pagination` | `page`, `limit`, `total`, `hrefFor` | link-based (URL state, LLD §6) | planned |

## `components/forms`

| Component | Key props | Notes | Status |
|-----------|-----------|-------|--------|
| `FormField` | `label`, `hint`, `error`, `required` | Wires `id`, `aria-describedby`, `aria-invalid` | planned |
| `TextInput`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch` | RHF `register`-compatible | | planned |
| `DateInput`, `DateRangePicker` | `value` as `YYYY-MM-DD` | No time-zone conversion (W12) | planned |
| `NumberStepper` | `min`, `max` | Guests, rooms, travellers | planned |
| `MoneyInput` | decimal string in/out | Partner rates and prices; never floats (W12) | planned |
| `FileUpload` | `purpose`, `accept`, `maxSize`, `onUploaded` | init → presigned PUT → complete (W16) | planned |
| `FormAlert` | `error` | Form-level backend errors with `requestId` (W11) | planned |

## `components/feedback`

| Component | Variants | Status |
|-----------|----------|--------|
| `Alert` | `info`, `success`, `warning`, `danger` | planned |
| `Toast` / `Toaster` | same tones | planned |
| `EmptyState` | `title`, `description`, `action` | planned |
| `ErrorState` | shows backend `code`-based message + `requestId` | planned |
| `ForbiddenState`, `NotFoundState` | | planned |

## `components/layout` and `components/navigation`

| Component | Purpose | Status |
|-----------|---------|--------|
| `Container`, `Section`, `Stack`, `Grid` | Layout primitives | planned |
| `SiteHeader`, `SiteFooter` | Public chrome, CMS menus (CMS_CONTRACTS §4) | planned |
| `AnnouncementBar` | Active CMS announcements | planned |
| `MainNav`, `MobileNav`, `MenuTree` | Menu rendering, max depth 3 | planned |
| `Breadcrumbs` | | planned |
| `AreaShell` | Sidebar + header for `/account`, `/partner`, `/admin`; nav items filtered by permission (W13) | planned |
| `PartnerSwitcher` | Partner context selection (W14) | planned, **blocked by gap G3** (no memberships list) |

## `components/data-display`

| Component | Purpose | Status |
|-----------|---------|--------|
| `Money` | Formats a decimal string + currency (W12) | planned |
| `DateText`, `DateRange` | Calendar dates and instants (Asia/Kolkata) | planned |
| `Rating`, `RatingSummary` | Backend `meta.rating` (count, average, distribution) | planned |
| `ImageFrame`, `Gallery` | `Image` objects with alt text, `next/image` | planned |
| `DataTable` | Admin/partner lists: sortable columns from API sort allowlists, URL-driven pagination | planned |
| `DescriptionList`, `KeyValue` | Detail views | planned |
| `StatTile` | Dashboard figures from report endpoints | planned |
| `DestinationCard`, `PropertyCard`, `GuideCard`, `ExperienceCard`, `PackageCard` | Props match OpenAPI card schemas | planned |

## `components/maps`

| Component | Purpose | Status |
|-----------|---------|--------|
| `LocationMap`, `NearbyMap` | Optional map view of `GeoPoint`s (WO4) | planned |

## `cms/sections`

The 8 section components are specified in [CMS_CONTRACTS.md](CMS_CONTRACTS.md) §2. Status: planned.
