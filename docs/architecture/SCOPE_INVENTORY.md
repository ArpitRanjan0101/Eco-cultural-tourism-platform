# Scope Inventory (extracted from the Technical Report v1.0)

Source of truth: `Jharkhand_Tourism_Complete_Backend_Technical_Report.pdf` (15 Oct 2026).
Counts were re-verified against the report's own lists: **22 modules, 13 table groups, 78 tables, 241 routes**.

Status legend: `[ ]` pending · `[x]` implemented + tested · `[~]` partially implemented.
Phase = phase of the agreed working method in which the item is delivered.

---

## 1. Modules (22)

| # | Module | Code location | Phase |
|---|--------|---------------|-------|
| 01 | Core & Configuration | `src/config`, `src/core` | 1 |
| 02 | Authentication | `modules/auth` | 2 |
| 03 | Users & RBAC | `modules/users` | 2 |
| 04 | Geography | `modules/geography` | 3 |
| 05 | Destinations | `modules/destinations` | 3 |
| 06 | Experiences | `modules/experiences` | 4 |
| 07 | Accommodation | `modules/properties` | 4 |
| 08 | Guides | `modules/guides` | 4 |
| 09 | Packages | `modules/packages` | 4 |
| 10 | Trip Planner | `modules/trips` | 8 |
| 11 | Discovery/Search | `modules/search` | 3 |
| 12 | Bookings/Inventory | `modules/bookings` | 5 |
| 13 | Payments/Refunds | `modules/payments` | 6 |
| 14 | Reviews/Favorites | `modules/reviews`, `modules/favorites` | 8 |
| 15 | CMS/Media | `modules/cms`, `modules/media` | 3 |
| 16 | Partner Management | `modules/partners` | 4 |
| 17 | Notifications | `modules/notifications` | 7 |
| 18 | Administration | `modules/administration` | 9 |
| 19 | Reporting | `modules/analytics` | 9 |
| 20 | Audit & Security | `modules/audit` | 2 (audit writer) / 9 (search) |
| 21 | Background Workers | `src/jobs` | 1 (process) / 5-7 (processors) |
| 22 | Platform Settings | `modules/settings` | 9 (read helper earlier if needed) |

## 2. Tables (78)

### 4.1 Identity, auth, RBAC (9) — Phase 2
- [x] users · [x] user_profiles · [x] roles · [x] permissions · [x] role_permissions · [x] user_roles
- [x] auth_refresh_tokens · [x] auth_verification_tokens · [x] auth_login_attempts

### 4.2 Geography & destinations (8) — Phase 3
- [x] regions · [x] districts · [x] destinations · [x] destination_categories · [x] destination_category_links
- [x] destination_media · [x] destination_faqs · [x] destination_related_places

### 4.3 Experiences (3) — Phase 4
- [x] experiences · [x] experience_media · [x] experience_sessions

### 4.4 Accommodation (10) — Phase 4
- [x] properties · [x] property_media · [x] amenities · [x] property_amenities · [x] room_types
- [x] room_type_media · [x] room_type_amenities · [x] room_inventory · [x] room_rates · [x] property_policies

### 4.5 Guides (7) — Phase 4
- [x] guides · [x] guide_languages · [x] guide_language_links · [x] guide_destinations
- [x] guide_services · [x] guide_availability · [x] guide_verification_documents

### 4.6 Packages (7) — Phase 4
- [x] packages · [x] package_destinations · [x] package_itinerary_days · [x] package_itinerary_items
- [x] package_inclusions · [x] package_media · [x] package_departures

### 4.7 Trip planner (3) — Phase 8
- [ ] trips · [ ] trip_days · [ ] trip_stops

### 4.8 Bookings & holds (7) — Phase 5
- [x] bookings · [x] booking_items · [x] booking_travelers · [x] inventory_holds
- [x] booking_status_history · [x] booking_cancellations · [x] booking_documents

### 4.9 Payments & refunds (4) — Phase 6
- [x] payment_orders · [x] payment_transactions · [x] payment_webhook_events · [x] refunds

### 4.10 Partners (4) — Phase 4
- [x] partners · [x] partner_users · [x] partner_documents · [x] partner_approval_history

### 4.11 Reviews & favorites (2) — Phase 8
- [ ] reviews · [ ] favorites

### 4.12 CMS & media (7) — Phase 3
- [x] media_assets · [x] cms_pages · [x] cms_page_sections · [x] cms_menus · [x] cms_menu_items
- [x] cms_redirects · [x] cms_announcements

### 4.13 Notifications, audit, operations (7)
- [ ] notification_templates (7) · [ ] notifications (7) · [ ] notification_deliveries (7)
- [x] platform_settings (5; admin routes in 9) · [x] audit_logs (2)
- [~] outbox_events (2: table + writer; dispatch in 7) · [x] idempotency_records (5)

Infrastructure-only table outside the 78: `schema_migrations` (migration bookkeeping, Phase 1).

## 3. Endpoints (241)

Auth notation from the report: P public (via BFF token) · U user JWT · PARTNER · ADMIN · WEBHOOK.

### 5.1 Auth, profile, RBAC (21) — Phase 2 — [x] all 21 implemented, tested, in OpenAPI
```
POST /auth/register            POST /auth/login             POST /auth/refresh
POST /auth/logout              POST /auth/logout-all        GET  /auth/me
POST /auth/forgot-password     POST /auth/reset-password    POST /auth/change-password
POST /auth/verify-email        POST /auth/resend-verification
GET  /users/me                 PATCH /users/me              GET  /users/me/roles
GET  /admin/users              GET  /admin/users/:id        PATCH /admin/users/:id/status
PUT  /admin/users/:id/roles    GET  /admin/roles            GET  /admin/permissions
PUT  /admin/roles/:id/permissions
```

### 5.2 Geography & destinations (36) — Phase 3/4 — [~] 35 implemented; `/destinations/:slug/reviews` → P8
```
GET /regions  GET /districts  GET /districts/:slug  GET /districts/:slug/destinations
GET /destination-categories  GET /destinations  GET /destinations/featured
GET /destinations/:slug  GET /destinations/:slug/nearby  GET /destinations/:slug/experiences
GET /destinations/:slug/properties  GET /destinations/:slug/guides  GET /destinations/:slug/reviews
GET|POST /admin/destinations  GET|PATCH|DELETE /admin/destinations/:id
PATCH /admin/destinations/:id/status  PUT /admin/destinations/:id/categories
POST /admin/destinations/:id/media  DELETE /admin/destinations/:id/media/:mediaId
PUT /admin/destinations/:id/faqs  PUT /admin/destinations/:id/related
GET|POST /admin/regions  PATCH /admin/regions/:id  PATCH /admin/regions/:id/status
GET|POST /admin/districts  PATCH /admin/districts/:id  PATCH /admin/districts/:id/status
GET|POST /admin/destination-categories  PATCH /admin/destination-categories/:id
PATCH /admin/destination-categories/:id/status
```

### 5.3 Experiences (14) — Phase 4 — [x] all 14
```
GET /experiences  GET /experiences/:slug  GET /experiences/:id/sessions  GET /experiences/:id/availability
GET|POST /partners/me/experiences  PATCH /partners/me/experiences/:id
POST /partners/me/experiences/:id/sessions
PATCH|DELETE /partners/me/experiences/:id/sessions/:sessionId
POST /partners/me/experiences/:id/media  DELETE /partners/me/experiences/:id/media/:mediaId
GET /admin/experiences  PATCH /admin/experiences/:id/status
```

### 5.4 Accommodation (26) — Phase 4 — [x] all 26
```
GET /properties  GET /properties/:slug  GET /properties/:id/rooms  GET /properties/:id/availability  GET /amenities
GET|POST /partners/me/properties  PATCH /partners/me/properties/:id
PUT /partners/me/properties/:id/amenities  PUT /partners/me/properties/:id/policies
POST /partners/me/properties/:id/media  DELETE /partners/me/properties/:id/media/:mediaId
POST /partners/me/properties/:id/rooms  PATCH /partners/me/properties/:id/rooms/:roomId
PATCH /partners/me/properties/:id/rooms/:roomId/status
POST /partners/me/properties/:id/rooms/:roomId/media
DELETE /partners/me/properties/:id/rooms/:roomId/media/:mediaId
PUT /partners/me/rooms/:roomId/inventory  PUT /partners/me/rooms/:roomId/rates
GET /partners/me/rooms/:roomId/calendar
GET /admin/properties  GET /admin/properties/:id  PATCH /admin/properties/:id/status
GET|POST /admin/amenities  PATCH /admin/amenities/:id
```

### 5.5 Guides (22) — Phase 4 — [x] all 22
```
GET /guides  GET /guides/:id  GET /guides/:id/services  GET /guides/:id/availability  GET /languages
GET|POST /partners/me/guides  PATCH /partners/me/guides/:id
PUT /partners/me/guides/:id/languages  PUT /partners/me/guides/:id/destinations
POST /partners/me/guides/:id/services  PATCH /partners/me/guides/:id/services/:serviceId
PATCH /partners/me/guides/:id/services/:serviceId/status
PUT /partners/me/guides/:id/availability  POST /partners/me/guides/:id/documents
GET /admin/guides  GET /admin/guides/:id  PATCH /admin/guides/:id/verification
PATCH /admin/guides/:id/status  GET|POST /admin/languages  PATCH /admin/languages/:id
```

### 5.6 Packages (16) — Phase 4 — [x] all 16
```
GET /packages  GET /packages/:slug  GET /packages/:id/departures  GET /packages/:id/availability
GET|POST /partners/me/packages  PATCH /partners/me/packages/:id
PUT /partners/me/packages/:id/destinations  PUT /partners/me/packages/:id/itinerary
PUT /partners/me/packages/:id/inclusions
POST /partners/me/packages/:id/media  DELETE /partners/me/packages/:id/media/:mediaId
POST /partners/me/packages/:id/departures  PATCH /partners/me/packages/:id/departures/:departureId
GET /admin/packages  PATCH /admin/packages/:id/status
```

### 5.7 Trip planner (12) — Phase 8
```
GET|POST /trips  GET|PATCH|DELETE /trips/:id
POST /trips/:id/days  PATCH|DELETE /trips/:id/days/:dayId
POST /trips/:id/days/:dayId/stops  PATCH|DELETE /trips/:id/stops/:stopId
PATCH /trips/:id/stops/reorder
```

### 5.8 Search (4) — Phase 3 — [x] all 4 (destination + district types; supply types join in P4)
```
GET /search  GET /search/suggestions  GET /search/nearby  GET /search/filters
```

### 5.9 Bookings (16) — Phase 5/6 — [x] all 16
```
POST /bookings/quote  POST /bookings  GET /bookings  GET /bookings/:id  GET /bookings/:id/status
POST /bookings/:id/cancel  GET /bookings/:id/documents  POST /bookings/:id/payment-order (Phase 6)
GET /partners/me/bookings  GET /partners/me/bookings/:id
POST /partners/me/bookings/:id/approve  POST /partners/me/bookings/:id/reject
GET /admin/bookings  GET /admin/bookings/:id  POST /admin/bookings/:id/cancel
POST /admin/bookings/:id/refund (Phase 6)
```

### 5.10 Payments & refunds (8) — Phase 6 — [x] all 8
```
GET /payments/orders/:id  GET /payments/booking/:bookingId  POST /payments/verify
POST /webhooks/payments/:provider  GET /refunds/:id
GET /admin/payments  GET /admin/refunds  POST /admin/refunds/:id/retry
```

### 5.11 Partner onboarding (12) — Phase 4 — [x] all 12
```
POST /partners/apply  GET|PATCH /partners/me  POST /partners/me/documents
GET|POST /partners/me/users  PATCH|DELETE /partners/me/users/:userId
GET /admin/partners  GET /admin/partners/:id  PATCH /admin/partners/:id/status
GET /admin/partners/:id/documents
```

### 5.12 Reviews & favorites (9) — Phase 8
```
GET|POST /reviews  PATCH|DELETE /reviews/:id
GET|POST /favorites  DELETE /favorites/:type/:id
GET /admin/reviews  PATCH /admin/reviews/:id/status
```

### 5.13 CMS & media (25) — Phase 3 — [x] all 25
```
GET /content/pages/:slug  GET /content/homepage  GET /content/menus/:code  GET /content/announcements
GET|POST /admin/cms/pages  GET|PATCH|DELETE /admin/cms/pages/:id
PUT /admin/cms/pages/:id/sections  PATCH /admin/cms/pages/:id/status
GET|POST /admin/cms/menus  PUT /admin/cms/menus/:id/items
GET|POST /admin/cms/redirects  DELETE /admin/cms/redirects/:id
GET|POST /admin/cms/announcements  PATCH|DELETE /admin/cms/announcements/:id
POST /media/upload-init  POST /media/upload-complete  GET|DELETE /media/:id
```

### 5.14 Notifications (6) — Phase 7
```
GET /notifications  GET /notifications/unread-count  PATCH /notifications/:id/read
POST /notifications/read-all  GET /admin/notification-templates  PATCH /admin/notification-templates/:id
```

### 5.15 Admin, settings, reporting, health (14) — Phase 9 (health: Phase 1)
```
GET /admin/dashboard  GET /admin/reports/bookings  GET /admin/reports/revenue
GET /admin/reports/destinations  GET /admin/reports/partners
GET /partners/me/dashboard  GET /partners/me/reports/bookings  GET /partners/me/reports/revenue
GET|PATCH /admin/settings  GET /admin/audit-logs
[x] GET /health/live  [x] GET /health/ready  [x] GET /health/version
```

## 4. Background queues (7) — Section 9
- [ ] booking-expiration (5) · [ ] booking-confirmation (7) · [ ] payment-reconciliation (6)
- [ ] refund-processing (6) · [ ] notification-delivery (7) · [ ] media-processing (3/7) · [ ] outbox-dispatch (7)

## 5. Critical end-to-end scenarios (Section 11.1)
- [x] Register → verify → login → refresh → logout; revoked refresh cannot be reused (2)
- [x] Anonymous/unauthorised cannot reach private/partner/admin data (2/4/5/6)
- [x] Two customers race for last hotel room → exactly one wins (5: 6 concurrent, 1 succeeds)
- [x] Two users race for same guide slot → only non-overlapping commit (5: 4 concurrent + overlap checks)
- [x] Exactly-once payment under duplicate webhooks/callbacks (6)
- [x] Payment after hold expiry reconciles without overbooking (6: re-acquire or full refund)
- [x] Refund failure/retry/duplicate callback → single refund (6)
- [x] Partner cannot alter another partner's inventory or booking financials (4/5: no partner route mutates amounts)
- [x] CMS draft hidden; published section serialised safely (3)
- [ ] Worker/API restart does not lose outbox events (7)
- [ ] Backup restore keeps transactional records + media references (10)
