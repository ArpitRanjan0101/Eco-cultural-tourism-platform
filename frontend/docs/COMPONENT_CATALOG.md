# Component Catalog

Every shared component, its props and documented variants (W20). Built in Phase 2 in the order design tokens →
UI primitives → shared composites; feature components (Phase 4+) and pages consume these and never restyle
controls themselves.

**Status:** `built` = implemented, tokens only, unit/component tests + axe pass in Docker. `planned` = designed,
not built. Every built component has a live usage example at **`/design-system`** (development; 404 in
production unless `ENABLE_DESIGN_SYSTEM=true`, which only the e2e target sets — W30).

**Conventions for all components**
- Props marked `*` are required. Unknown `variant` / `size` / `tone` values throw in development and tests and
  fall back to the default in production (`pickVariant`, `src/config/componentVariants.js`).
- Variant class maps live in `componentVariants.js`; colours only via semantic tokens.
- Form controls forward `ref` (React 19 `ref` prop) and accept native attributes, so they work with React Hook
  Form `register`, controlled and uncontrolled.
- Tests: `src/tests/components/*.test.jsx` (Vitest + Testing Library + axe-core) and
  `src/tests/e2e/design-system.spec.js` (Chromium: real focus, keyboard, full-page axe incl. contrast).

## Design tokens — `src/app/globals.css` (`@theme`), mirrored in `src/config/theme.js`

| Group | Tokens | Notes |
|-------|--------|-------|
| Brand | `primary` #1f5f43 forest green (+`-hover`, `-soft`, `on-primary`), `accent` #9a4f1e warm earth (+`-hover`, `-soft`, `on-accent`) | WO5 resolved: forest green, earth accent, off-white, dark text |
| Surfaces / text | `surface` #faf8f3 off-white, `surface-raised`, `surface-muted`, `text` #1c2421, `muted`, `border`, `border-strong`, `focus`, `overlay` | |
| Status | `success`, `warning`, `danger` (+`-hover`), `info`, each with `-soft` background | |
| Type | `font-sans` Noto Sans (body), `font-display` Noto Serif 600/700 (h1–h3) via `next/font`, self-hosted | Noto covers Devanagari if Hindi is added (WO6) |
| Shape / depth / motion | `radius-sm/md/lg`, `shadow-sm/md/lg`, `duration-fast/base/slow` | Motion disabled under `prefers-reduced-motion` |
| Motif | `motif-divider` utility (restrained Sohrai-inspired dot row), decorative only | |

`theme.test.js` fails if `theme.js` and `globals.css` differ, and checks **21 contrast pairs** against WCAG AA
(4.5:1 text, 3:1 UI boundaries). Breakpoints: Tailwind defaults (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

## A. Layout — `src/components/layout`, `src/components/ui`

| Component | Props | Variants | Status |
|-----------|-------|----------|--------|
| `Container` | `size`, `as`, `className`, `children` | size `sm` `md` `lg`(default) `xl` `full`; 16 px mobile gutter | built |
| `Section` | `title`, `description`, `headingLevel` 2/3, `spacing`, `tone`, `containerSize`, `id` (labels the region by its heading) | spacing `none` `sm` `md` `lg`; tone `default` `muted` `raised` `primary` | built |
| `PageHeader` | `title*`, `description`, `eyebrow`, `breadcrumbs`, `actions` | renders the page's only `h1` + motif divider | built |
| `VisuallyHidden` | `as`, `children*` | | built |
| `DashboardShell` | `title*`, `navLabel*`, `navItems*` `[{href,label,icon?,exact?}]`, `headerActions`, `currentPath` | sidebar ≥ `lg`, drawer navigation below; skip link; `aria-current` on the active item; items arrive permission-filtered (W13) | built |

## B. Actions — `src/components/ui`

| Component | Props | Variants | Status |
|-----------|-------|----------|--------|
| `Button` | `variant`, `size`, `loading`, `disabled`, `type` (default `button`), `fullWidth`, `leadingIcon`, `trailingIcon`, `children*` | `primary` `secondary` `outline` `ghost` `danger` · `sm` `md` `lg`; `loading` keeps the label, disables, `aria-busy` | built |
| `ButtonLink` (export of Button) | `href*`, `variant`, `size`, `fullWidth`, `children*` | same as Button, renders `next/link` | built |
| `IconButton` | `icon*`, `label*` (accessible name + title), `variant` (default `ghost`), `size` | same variants; square sizes | built |
| `TextLink` | `href*`, `variant`, `external`, `children*` | `inline` `standalone` `subtle`; `external` → new tab, `rel="noopener noreferrer"`, announces "(opens in a new tab)" | built |

## C. Forms — `src/components/forms`, `src/components/ui`

| Component | Props | Behaviour | Status |
|-----------|-------|-----------|--------|
| `FormField` | `label*`, `hint`, `error`, `required`, `id`, `hideLabel`, `children*` (render fn receiving control props) | wires `id`, `aria-describedby` (hint + error), `aria-invalid`, `required`; also exports `useFieldA11y`, `FieldHint`, `FieldError` | built |
| `Input` | `label*`, `hint`, `error`, `required`, `hideLabel`, `size`, `type`, `ref` + native | `sm` `md` `lg`; invalid border; disabled styling | built |
| `Textarea` | `label*`, `hint`, `error`, `required`, `rows`, `ref` + native | | built |
| `Select` | `label*`, `options*` `[{value,label,disabled?}]`, `placeholder`, `hint`, `error`, `required`, `size`, `ref` + native | native `<select>`; placeholder disabled when required | built |
| `Checkbox` | `label*`, `hint`, `error`, `ref` + native (`checked`/`defaultChecked`) | controlled or uncontrolled | built |
| `RadioGroup` | `legend*`, `name*`, `options*` `[{value,label,hint?,disabled?}]`, `value`/`defaultValue`, `onChange(value)`, `hint`, `error`, `required`, `orientation` | `fieldset`/`legend`; native arrow-key selection; `vertical` `horizontal` | built |
| `Switch` | `label*`, `description`, `checked`/`defaultChecked`, `onChange(checked)`, `disabled`, `name` | `role="switch"`, Space/Enter toggle; hidden input submits `true`/`false` | built |
| `DatePicker` | Input props + `min`, `max` | native date input, `YYYY-MM-DD`, no time-zone conversion (W12); generic, no stay rules | built |
| `DateRangePicker` | `legend*`, `value*` `{start,end}`, `onChange*`, `startLabel`, `endLabel`, `min`, `max`, `allowSameDay`, `required`, `hint`, `error`, `startName`, `endName` | end ≥ start (or > start) validated with message; end `min` follows start; exports `validateDateRange` | built |
| `FileUpload` | — | presigned upload flow (W16) needs the BFF | planned (Phase 7) |
| `MoneyInput`, `NumberStepper` | — | built with the features that need them | planned (Phase 5–8) |

## D. Navigation and overlays

| Component | Props | Keyboard / behaviour | Status |
|-----------|-------|----------------------|--------|
| `Tabs` | `label*`, `tabs*` `[{id,label,content,disabled?}]`, `value`/`defaultValue`, `onChange` | roving focus; ←/→ wrap and skip disabled; Home/End | built |
| `Breadcrumbs` | `items*` `[{label,href?}]`, `label` | last item `aria-current="page"` | built |
| `Pagination` | `page*`, `pageSize*`, `total*`, `hrefFor*`, `label`, `showSummary` | link-based (URL state), "Showing a–b of n", gaps, disabled edges; hidden for one page; exports `pageWindow` | built |
| `DropdownMenu` | `label*`, `items*` `[{id,label,onSelect?,href?,disabled?,tone?}]`, `variant`, `size`, `align` | ↓/Enter/Space open on first, ↑ on last; ↑/↓/Home/End; Esc returns focus; Tab/outside click closes | built |
| `Dialog` | `open*`, `onClose*`, `title*`, `description`, `footer`, `size` (`sm` `md` `lg` `xl`), `closeLabel`, `closeOnBackdrop`, `initialFocusRef` | native modal `<dialog>`: inert page, Tab/Shift+Tab wrap, Esc and backdrop close, focus returns, scroll lock | built |
| `Drawer` | Dialog props + `side` (`right` `left` `bottom`) | same as Dialog | built |
| `Popover` | `label*`, `title*`, `children*`, `variant`, `size`, `align` | non-modal; focus moves into panel; Esc returns focus; outside click closes | built |
| `Tooltip` | `content*`, `children*` (one focusable element), `side` | on hover and focus, `aria-describedby`, Esc hides; never essential content | built |

## E. Data display and feedback

| Component | Props | Variants / behaviour | Status |
|-----------|-------|----------------------|--------|
| `BaseCard` | `as`, `variant`, `padding`, `media`, `header`, `footer`, `interactive` | `plain` `elevated` `outlined` · padding `none` `sm` `md` `lg`; no domain fields | built |
| `Badge` | `tone`, `size`, `children*` | `neutral` `primary` `accent` `success` `warning` `danger` `info` · `sm` `md` | built |
| `StatusBadge` | `status*`, `tones` map, `labels` map, `size` | caller supplies status→tone (features own domain mappings); unknown → neutral; `humanizeStatus` | built |
| `Avatar` | `name*`, `src`, `size` | image or initials with accessible name · `sm` `md` `lg` | built |
| `StatCard` | `label*`, `value*` (pre-formatted), `change`, `trend`, `hint`, `icon` | trend `up` `down` `neutral` | built |
| `DataTable` | `caption*`, `columns*` `[{key,header,cell?,sortable?,align?}]`, `rows*`, `getRowKey*`, `sort`, `onSortChange`, `loading`, `loadingRows`, `emptyState`, `hideCaption` | `aria-sort`; sorting delegated to the API; skeleton rows + `aria-busy`; focusable scroll region | built |
| `FilterToolbar` | `label*`, `children*`, `action` (GET → URL) or `onSubmit`, `submitLabel`, `onReset`, `resetLabel`, `activeCount` | `role="search"`; responsive grid | built |
| `Alert` | `tone`, `title`, `children`, `action`, `onDismiss` | `info` `success` `warning` `danger`; danger = `role="alert"`, others `status` | built |
| `ToastProvider` / `useToast` | `show({tone,title,description,duration})`, `dismiss(id)` | polite/assertive live regions; auto-dismiss (5 s default, `null` = sticky); mounted in `AppProviders` | built |
| `Spinner` | `size`, `label` | labelled → `role="status"`; unlabelled → decorative | built |
| `Skeleton` | `shape` (`rect` `text` `circle`), `lines` | decorative | built |
| `PageLoading` | `label` | Suspense fallback for page areas (W29) | built |
| `EmptyState` | `title*`, `description`, `icon`, `action`, `headingLevel` | real empty results (W22) | built |
| `ForbiddenState` | `title`, `description`, `homeHref`, `homeLabel` | signed in but not permitted (W13); page `h1` | built (Phase 3) |
| `ErrorState` | `title`, `description`, `requestId`, `onRetry`, `retryLabel`, `headingLevel` | shows backend `requestId` | built |
| `ConfirmationDialog` | `open*`, `title*`, `onConfirm*`, `onCancel*`, `description`, `confirmLabel`, `cancelLabel`, `tone` (`primary` `danger`), `loading` | focus starts on Cancel; dismissal blocked while loading | built |

## F. Rich shared components

| Component | Props | Behaviour | Status |
|-----------|-------|-----------|--------|
| `Accordion` | `items*` `[{id,title,content}]`, `allowMultiple`, `defaultOpen`, `headingLevel` | heading-wrapped buttons, `aria-expanded`, labelled regions | built |
| `ImageGallery` | `images*` (API `Image` shape), `title*`, `columns` (2/3/4) | thumbnails open a Dialog lightbox; prev/next buttons and ←/→; alt fallback "title, image n of N" | built |
| `Carousel` | `label*`, `items*`, `renderItem*`, `getItemKey*` | WAI-ARIA carousel; never auto-rotates; inactive slides inert; 24 px dot targets | built |
| `Timeline` | `items*` `[{id,title,time?,dateTime?,description?,tone?}]` | ordered list with `<time datetime>` | built |
| Maps (`LocationMap`, `NearbyMap`) | — | deferred to Phase 5 with location discovery (WO4) | planned |

## Feature: auth — `src/features/auth` (Phase 3)

| Component | Props | Behaviour | Status |
|-----------|-------|-----------|--------|
| `AuthCard` | `title*`, `description`, `footer`, `children*` | centred panel, page `h1` | built |
| `LoginForm` | `next*` (validated path) | RHF + Zod; friendly codes (`INVALID_CREDENTIALS`, `LOGIN_LOCKED` + retry time, `ACCOUNT_SUSPENDED`); navigates to `next` | built |
| `RegisterForm` | — | confirm-password check; shows the backend's neutral 202 message | built |
| `ForgotPasswordForm` / `EmailRequestForm` | `action*`, `submitLabel*`, `defaultEmail` | single-email request, neutral 202 message | built |
| `ResetPasswordForm` | `token` | malformed/expired link states; success says every session ended | built |
| `EmailVerification` | `token` | POSTs once (Strict-Mode safe); failure offers a new link | built |
| `SignOutButtons` | — | sign out; sign out everywhere behind `ConfirmationDialog` | built |
| `PermissionGate` | `user*`, `require*`, `mode`, `fallback` | presentation only (W13) | built |
| `FormMessage` | `message`, `requestId` | form-level error with reference | built |

## Planned for later phases

`SiteHeader`, `SiteFooter`, `AnnouncementBar`, `MainNav`/`MobileNav`/`MenuTree` (Phase 4, CMS menus) ·
`Money`, `DateText`, `Rating` (Phase 4–5) · supply cards `DestinationCard`, `PropertyCard`, `GuideCard`,
`ExperienceCard`, `PackageCard` (feature components composing `BaseCard`, Phase 4–5) · `PartnerSwitcher`
(blocked by gap G3) · CMS section components (CMS_CONTRACTS.md §2, Phase 4).
