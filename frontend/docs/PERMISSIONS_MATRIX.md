# Permissions Matrix — frontend view of backend RBAC

Source of truth: backend migration `backend/src/database/migrations/0004_rbac_catalog.up.sql` (6 roles,
48 permissions) and the per-route permissions in [API_MAPPING.md](API_MAPPING.md). The frontend uses this only
to **show or hide** UI (W13). The backend enforces every permission, partner ownership and row ownership itself
(backend A3, D4).

**Rule for frontend code:** gate on **permission codes** from `GET /auth/me` (`data.permissions`), never on role
codes. Grants below are the seeded defaults; a super admin can change them at runtime (`PUT /admin/roles/:id/permissions`),
and a user may hold several roles (e.g. tourist + hotel_partner).

## 1. Default grants per role

`T` tourist · `G` guide · `H` hotel_partner · `P` package_provider · `A` admin · `S` super_admin (always every permission).

| Permission | T | G | H | P | A | S |
|------------|:-:|:-:|:-:|:-:|:-:|:-:|
| `bookings.create.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `bookings.read.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `bookings.cancel.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `payments.create.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `payments.read.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `trips.manage.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `reviews.write.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `favorites.manage.own` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `notifications.read.own` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `partners.apply` | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `media.upload` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `partners.manage.own` | | ✓ | ✓ | ✓ | | ✓ |
| `bookings.manage.partner` | | ✓ | ✓ | ✓ | | ✓ |
| `reports.read.partner` | | ✓ | ✓ | ✓ | | ✓ |
| `guides.manage.own` | | ✓ | | | | ✓ |
| `properties.manage.own` | | | ✓ | | | ✓ |
| `experiences.manage.own` | | | | ✓ | | ✓ |
| `packages.manage.own` | | | | ✓ | | ✓ |
| `users.read` | | | | | ✓ | ✓ |
| `users.manage` | | | | | ✓ | ✓ |
| `roles.read` | | | | | ✓ | ✓ |
| `roles.assign` | | | | | | ✓ |
| `roles.manage` | | | | | | ✓ |
| `audit.read` | | | | | ✓ | ✓ |
| `settings.read` | | | | | ✓ | ✓ |
| `settings.write` | | | | | | ✓ |
| `geography.manage` | | | | | ✓ | ✓ |
| `destinations.read` | | | | | ✓ | ✓ |
| `destinations.manage` | | | | | ✓ | ✓ |
| `destinations.publish` | | | | | ✓ | ✓ |
| `experiences.moderate` | | | | | ✓ | ✓ |
| `properties.moderate` | | | | | ✓ | ✓ |
| `amenities.manage` | | | | | ✓ | ✓ |
| `guides.verify` | | | | | ✓ | ✓ |
| `languages.manage` | | | | | ✓ | ✓ |
| `packages.moderate` | | | | | ✓ | ✓ |
| `partners.review` | | | | | ✓ | ✓ |
| `bookings.read.platform` | | | | | ✓ | ✓ |
| `bookings.manage.platform` | | | | | ✓ | ✓ |
| `payments.read.platform` | | | | | ✓ | ✓ |
| `refunds.initiate` | | | | | | ✓ |
| `refunds.retry` | | | | | | ✓ |
| `reviews.moderate` | | | | | ✓ | ✓ |
| `cms.manage` | | | | | ✓ | ✓ |
| `cms.publish` | | | | | ✓ | ✓ |
| `media.manage` | | | | | ✓ | ✓ |
| `notification_templates.manage` | | | | | ✓ | ✓ |
| `reports.read.platform` | | | | | ✓ | ✓ |

Partner roles get the tourist baseline plus `partners.manage.own`, `bookings.manage.partner` and
`reports.read.partner`, and are granted only after their organisation is approved (backend D2). Admin has no
refund, RBAC-assignment or settings-write authority by default (backend A11).

## 2. Page gates

A page is shown when the user has the **page permission**; individual actions inside it check their own
permission. Gates are evaluated server-side in the area layout (W13); the backend's 403 remains the authority.

### Tourist (`/account/*`) — session required

| Page | Page permission | Action permissions |
|------|-----------------|--------------------|
| `/account`, `/account/profile` | session only | `media.upload` (avatar) |
| `/account/bookings`, `/[id]` | `bookings.read.own` | `bookings.cancel.own`, `payments.create.own`, `payments.read.own` |
| `/account/trips`, `/new`, `/[id]` | `trips.manage.own` | — |
| `/account/favorites` | `favorites.manage.own` | — |
| `/account/notifications` | `notifications.read.own` | — |
| Booking widget, `/checkout/[bookingId]` | `bookings.create.own` | `payments.create.own`; verified email required (backend A5) |
| Review forms | `reviews.write.own` | — |

### Partner (`/partner/*`) — session + partner membership

Partner routes also require an approved organisation of a type that allows the supply (backend partnerGuard,
FLOW §4); applicants with `partners.apply` reach the organisation, verification and team pages only.

| Page | Page permission |
|------|-----------------|
| `/partner` (application when no membership) | `partners.apply` |
| `/partner` dashboard, `/partner/reports` | `reports.read.partner` |
| `/partner/organization`, `/verification`, `/team` | any of `partners.apply`, `partners.manage.own` |
| `/partner/properties`, `/partner/rooms` | `properties.manage.own` |
| `/partner/guides` | `guides.manage.own` |
| `/partner/experiences` | `experiences.manage.own` |
| `/partner/packages` | `packages.manage.own` |
| `/partner/bookings` | `bookings.manage.partner` |

### Admin (`/admin/*`) — session + permission

The admin layout is shown to users holding **any** permission listed below; navigation shows only the pages
the user can open.

| Page | Page permission | Action permissions |
|------|-----------------|--------------------|
| `/admin` dashboard, `/admin/reports` | `reports.read.platform` | — |
| `/admin/users` | `users.read` | `users.manage` (status), `roles.assign` (roles) |
| `/admin/roles` | `roles.read` | `roles.manage` |
| `/admin/geography` | `geography.manage` | — (regions, districts, destination categories) |
| `/admin/destinations` | `destinations.read` | `destinations.manage`, `destinations.publish` |
| `/admin/properties` | `properties.moderate` | `amenities.manage` (amenity catalogue) |
| `/admin/guides` | `guides.verify` | `languages.manage` (language list) |
| `/admin/experiences` | `experiences.moderate` | — |
| `/admin/packages` | `packages.moderate` | — |
| `/admin/partners` | `partners.review` | — |
| `/admin/bookings` | `bookings.read.platform` | `bookings.manage.platform` (cancel), `refunds.initiate` (refund) |
| `/admin/payments` | `payments.read.platform` | — |
| `/admin/refunds` | `payments.read.platform` | `refunds.retry` |
| `/admin/reviews` | `reviews.moderate` | — |
| `/admin/cms` | `cms.manage` | `cms.publish` (status, archive) |
| `/admin/notifications` | `notification_templates.manage` | — (templates only; no other admin notification routes) |
| `/admin/audit-logs` | `audit.read` | — |
| `/admin/settings` | `settings.read` | `settings.write` |
| `/admin/media` | `media.manage` | **Contract gap:** no media listing route exists (only `upload-init`, `upload-complete`, `GET/DELETE /media/:id`). See IMPLEMENTATION_STATUS open items. |
