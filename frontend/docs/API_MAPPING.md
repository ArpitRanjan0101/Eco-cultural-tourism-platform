# API Mapping: backend contract to frontend consumers

**Generated** from `docs/api/openapi.json` (OpenAPI 3.0.3, API 0.1.0, **242 operations**) on 2026-10-17.
Do not edit the tables by hand: change the consumer rules in the generator and regenerate (see DECISIONS W24).
If the backend contract changes, regenerate this file and the BFF allowlist together.

**Status:** Method, Path, Auth, Permission(s), Headers and Summary are **Confirmed** (read from the contract).
Frontend consumer and Phase are **Proposed** (frontend plan, see SITEMAP.md). Backend gaps: DECISIONS.md section 3.

**Auth:** `P` = service token only (public data via BFF); `U` = service token + user JWT; `PARTNER` = U + approved
partner membership (backend `partnerGuard`); `ADMIN` = U + admin permission; `S` = service token, server-only;
`WEBHOOK` = provider signature, never called by the frontend. **Phase** = frontend phase that first consumes it
(see IMPLEMENTATION_STATUS.md). Paths are shown with OpenAPI `{param}` syntax.

**Browser access rule:** the browser calls only `/api/*` on the Next.js origin. The BFF forwards an operation only
if it is in this contract (allowlist, W5); `WEBHOOK` and `/health/*` rows are never forwarded, and the four
session routes (`login`, `refresh`, `logout`, `logout-all`) are handled only by dedicated BFF handlers because
`login`/`refresh` return tokens in the response body (W3).

## Operations per frontend phase

| Phase | Operations |
|-------|-----------:|
| - | 1 |
| 1 | 3 |
| 3 | 11 |
| 4 | 18 |
| 5 | 21 |
| 5-7 | 4 |
| 6 | 4 |
| 6-7 | 8 |
| 7 | 23 |
| 7-9 | 4 |
| 8 | 58 |
| 9 | 87 |

## Health (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/health/live` | none |  |  | Process liveness | BFF server only (readiness probe) | 1 |
| GET | `/health/ready` | S |  |  | Dependency readiness (PostgreSQL, Redis, migrations; worker reported, not gating) | BFF server only (readiness probe) | 1 |
| GET | `/health/version` | S |  |  | Deployment information | BFF server only (readiness probe) | 1 |

## Auth (11)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/auth/register` | P |  |  | Create user account | (auth) pages, session | 3 |
| POST | `/api/v1/auth/login` | P |  |  | Authenticate and issue access/refresh tokens | Dedicated BFF auth handler (sets/clears cookies) | 3 |
| POST | `/api/v1/auth/refresh` | P |  |  | Rotate refresh token | Dedicated BFF auth handler (sets/clears cookies) | 3 |
| POST | `/api/v1/auth/logout` | P |  |  | Revoke current refresh session | Dedicated BFF auth handler (sets/clears cookies) | 3 |
| POST | `/api/v1/auth/logout-all` | U |  |  | Revoke all sessions | Dedicated BFF auth handler (sets/clears cookies) | 3 |
| GET | `/api/v1/auth/me` | U |  |  | Return authenticated user and permissions | (auth) pages, session | 3 |
| POST | `/api/v1/auth/forgot-password` | P |  |  | Request password reset | (auth) pages, session | 3 |
| POST | `/api/v1/auth/reset-password` | P |  |  | Reset password with verification token | (auth) pages, session | 3 |
| POST | `/api/v1/auth/change-password` | U |  |  | Change password while logged in | (auth) pages, session | 3 |
| POST | `/api/v1/auth/verify-email` | P |  |  | Complete email verification | (auth) pages, session | 3 |
| POST | `/api/v1/auth/resend-verification` | P |  |  | Resend verification | (auth) pages, session | 3 |

## Users (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/users/me` | U |  |  | Read personal profile | /account/profile | 7 |
| PATCH | `/api/v1/users/me` | U |  |  | Update personal profile | /account/profile | 7 |
| GET | `/api/v1/users/me/roles` | U |  |  | Read assigned roles | /account/profile | 7 |

## Admin: Users & RBAC (7)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/users` | ADMIN | `users.read` |  | Search user accounts | /admin/users, /admin/roles | 9 |
| GET | `/api/v1/admin/users/{id}` | ADMIN | `users.read` |  | Read user account | /admin/users, /admin/roles | 9 |
| PATCH | `/api/v1/admin/users/{id}/status` | ADMIN | `users.manage` |  | Suspend or reactivate user | /admin/users, /admin/roles | 9 |
| PUT | `/api/v1/admin/users/{id}/roles` | ADMIN | `roles.assign` |  | Set user roles | /admin/users, /admin/roles | 9 |
| GET | `/api/v1/admin/roles` | ADMIN | `roles.read` |  | List roles | /admin/users, /admin/roles | 9 |
| GET | `/api/v1/admin/permissions` | ADMIN | `roles.read` |  | List permissions | /admin/users, /admin/roles | 9 |
| PUT | `/api/v1/admin/roles/{id}/permissions` | ADMIN | `roles.manage` |  | Set permissions for role | /admin/users, /admin/roles | 9 |

## Media (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/media/upload-init` | U | `media.upload` |  | Authorize signed media upload | Shared upload component (account, partner, admin) | 7-9 |
| POST | `/api/v1/media/upload-complete` | U | `media.upload` |  | Verify/register object metadata | Shared upload component (account, partner, admin) | 7-9 |
| GET | `/api/v1/media/{id}` | U |  |  | Read metadata or signed file URL | Shared upload component (account, partner, admin) | 7-9 |
| DELETE | `/api/v1/media/{id}` | U |  |  | Delete unreferenced allowed media | Shared upload component (account, partner, admin) | 7-9 |

## Geography (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/regions` | P |  |  | List regions | /districts, /districts/[slug], filters | 4 |
| GET | `/api/v1/districts` | P |  |  | List districts | /districts, /districts/[slug], filters | 4 |
| GET | `/api/v1/districts/{slug}` | P |  |  | Get district | /districts, /districts/[slug], filters | 4 |

## Admin: Geography (8)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/regions` | ADMIN | `geography.manage` |  | List managed regions | /admin/geography | 9 |
| POST | `/api/v1/admin/regions` | ADMIN | `geography.manage` |  | Create region | /admin/geography | 9 |
| PATCH | `/api/v1/admin/regions/{id}` | ADMIN | `geography.manage` |  | Update region | /admin/geography | 9 |
| PATCH | `/api/v1/admin/regions/{id}/status` | ADMIN | `geography.manage` |  | Set region status | /admin/geography | 9 |
| GET | `/api/v1/admin/districts` | ADMIN | `geography.manage` |  | List managed districts | /admin/geography | 9 |
| POST | `/api/v1/admin/districts` | ADMIN | `geography.manage` |  | Create district | /admin/geography | 9 |
| PATCH | `/api/v1/admin/districts/{id}` | ADMIN | `geography.manage` |  | Update district | /admin/geography | 9 |
| PATCH | `/api/v1/admin/districts/{id}/status` | ADMIN | `geography.manage` |  | Set district status | /admin/geography | 9 |

## Destinations (9)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/districts/{slug}/destinations` | P |  |  | List district attractions | /districts, /districts/[slug], filters | 4 |
| GET | `/api/v1/destination-categories` | P |  |  | List destination categories | /explore, /destinations filters | 4 |
| GET | `/api/v1/destinations` | P |  |  | List/filter published destinations | /destinations, /destinations/[slug], home | 4 |
| GET | `/api/v1/destinations/featured` | P |  |  | Get featured destinations | /destinations, /destinations/[slug], home | 4 |
| GET | `/api/v1/destinations/{slug}` | P |  |  | Get destination detail | /destinations, /destinations/[slug], home | 4 |
| GET | `/api/v1/destinations/{slug}/nearby` | P |  |  | Get nearby destinations | /destinations, /destinations/[slug], home | 4 |
| GET | `/api/v1/destinations/{slug}/properties` | P |  |  | Get nearby properties | /destinations/[slug] (related supply) | 5 |
| GET | `/api/v1/destinations/{slug}/guides` | P |  |  | Find guides for destination | /destinations/[slug] (related supply) | 5 |
| GET | `/api/v1/destinations/{slug}/experiences` | P |  |  | Get related experiences | /destinations/[slug] (related supply) | 5 |

## Admin: Destinations (15)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/destinations` | ADMIN | `destinations.read` |  | List destinations including drafts | /admin/destinations | 9 |
| POST | `/api/v1/admin/destinations` | ADMIN | `destinations.manage` |  | Create destination | /admin/destinations | 9 |
| GET | `/api/v1/admin/destinations/{id}` | ADMIN | `destinations.read` |  | Read admin destination detail | /admin/destinations | 9 |
| PATCH | `/api/v1/admin/destinations/{id}` | ADMIN | `destinations.manage` |  | Update destination | /admin/destinations | 9 |
| DELETE | `/api/v1/admin/destinations/{id}` | ADMIN | `destinations.manage` |  | Archive destination | /admin/destinations | 9 |
| PATCH | `/api/v1/admin/destinations/{id}/status` | ADMIN | `destinations.publish` |  | Publish/unpublish destination | /admin/destinations | 9 |
| PUT | `/api/v1/admin/destinations/{id}/categories` | ADMIN | `destinations.manage` |  | Replace destination categories | /admin/destinations | 9 |
| POST | `/api/v1/admin/destinations/{id}/media` | ADMIN | `destinations.manage` |  | Attach destination media | /admin/destinations | 9 |
| DELETE | `/api/v1/admin/destinations/{id}/media/{mediaId}` | ADMIN | `destinations.manage` |  | Detach media | /admin/destinations | 9 |
| PUT | `/api/v1/admin/destinations/{id}/faqs` | ADMIN | `destinations.manage` |  | Replace FAQs | /admin/destinations | 9 |
| PUT | `/api/v1/admin/destinations/{id}/related` | ADMIN | `destinations.manage` |  | Set related destinations | /admin/destinations | 9 |
| GET | `/api/v1/admin/destination-categories` | ADMIN | `geography.manage` |  | List managed categories | /admin/geography | 9 |
| POST | `/api/v1/admin/destination-categories` | ADMIN | `geography.manage` |  | Create category | /admin/geography | 9 |
| PATCH | `/api/v1/admin/destination-categories/{id}` | ADMIN | `geography.manage` |  | Update category | /admin/geography | 9 |
| PATCH | `/api/v1/admin/destination-categories/{id}/status` | ADMIN | `geography.manage` |  | Set category status | /admin/geography | 9 |

## Content (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/content/pages/{slug}` | P |  |  | Read published public page | CMS renderer: /, /pages/[slug], header/footer, announcements | 4 |
| GET | `/api/v1/content/homepage` | P |  |  | Read approved homepage sections | CMS renderer: /, /pages/[slug], header/footer, announcements | 4 |
| GET | `/api/v1/content/menus/{code}` | P |  |  | Read navigation menu | CMS renderer: /, /pages/[slug], header/footer, announcements | 4 |
| GET | `/api/v1/content/announcements` | P |  |  | Read active notices | CMS renderer: /, /pages/[slug], header/footer, announcements | 4 |

## Admin: CMS (17)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/cms/pages` | ADMIN | `cms.manage` |  | List all pages | /admin/cms | 9 |
| POST | `/api/v1/admin/cms/pages` | ADMIN | `cms.manage` |  | Create page | /admin/cms | 9 |
| GET | `/api/v1/admin/cms/pages/{id}` | ADMIN | `cms.manage` |  | Read page for editor | /admin/cms | 9 |
| PATCH | `/api/v1/admin/cms/pages/{id}` | ADMIN | `cms.manage` |  | Edit page metadata | /admin/cms | 9 |
| DELETE | `/api/v1/admin/cms/pages/{id}` | ADMIN | `cms.publish` |  | Archive page | /admin/cms | 9 |
| PUT | `/api/v1/admin/cms/pages/{id}/sections` | ADMIN | `cms.manage` |  | Replace ordered section configuration | /admin/cms | 9 |
| PATCH | `/api/v1/admin/cms/pages/{id}/status` | ADMIN | `cms.publish` |  | Draft/publish/archive | /admin/cms | 9 |
| GET | `/api/v1/admin/cms/menus` | ADMIN | `cms.manage` |  | Manage menus | /admin/cms | 9 |
| POST | `/api/v1/admin/cms/menus` | ADMIN | `cms.manage` |  | Create menu | /admin/cms | 9 |
| PUT | `/api/v1/admin/cms/menus/{id}/items` | ADMIN | `cms.manage` |  | Replace ordered menu tree | /admin/cms | 9 |
| GET | `/api/v1/admin/cms/redirects` | ADMIN | `cms.manage` |  | Read redirects | /admin/cms | 9 |
| POST | `/api/v1/admin/cms/redirects` | ADMIN | `cms.manage` |  | Create redirect | /admin/cms | 9 |
| DELETE | `/api/v1/admin/cms/redirects/{id}` | ADMIN | `cms.manage` |  | Delete redirect | /admin/cms | 9 |
| GET | `/api/v1/admin/cms/announcements` | ADMIN | `cms.manage` |  | Read announcements | /admin/cms | 9 |
| POST | `/api/v1/admin/cms/announcements` | ADMIN | `cms.manage` |  | Create announcement | /admin/cms | 9 |
| PATCH | `/api/v1/admin/cms/announcements/{id}` | ADMIN | `cms.manage` |  | Edit announcement | /admin/cms | 9 |
| DELETE | `/api/v1/admin/cms/announcements/{id}` | ADMIN | `cms.manage` |  | Remove announcement | /admin/cms | 9 |

## Search (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/search` | P |  |  | Unified search | /search, global search box | 4 |
| GET | `/api/v1/search/suggestions` | P |  |  | Autocomplete | /search, global search box | 4 |
| GET | `/api/v1/search/nearby` | P |  |  | Radius search using coordinates | /search, global search box | 4 |
| GET | `/api/v1/search/filters` | P |  |  | Available filter options | /search, global search box | 4 |

## Partners (8)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/partners/apply` | U | `partners.apply` |  | Submit partner application | /partner (application) | 8 |
| GET | `/api/v1/partners/me` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Read own partner organisation | /partner/organization | 8 |
| PATCH | `/api/v1/partners/me` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Update partner organisation | /partner/organization | 8 |
| POST | `/api/v1/partners/me/documents` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Upload verification document | /partner/verification | 8 |
| GET | `/api/v1/partners/me/users` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | List team members | /partner/team | 8 |
| POST | `/api/v1/partners/me/users` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Add verified existing user | /partner/team | 8 |
| PATCH | `/api/v1/partners/me/users/{userId}` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Change partner-level role | /partner/team | 8 |
| DELETE | `/api/v1/partners/me/users/{userId}` | PARTNER | any of `partners.apply`, `partners.manage.own` | X-Partner-Id | Remove organisation membership | /partner/team | 8 |

## Admin: Partners (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/partners` | ADMIN | `partners.review` |  | Review partner applications | /admin/partners | 9 |
| GET | `/api/v1/admin/partners/{id}` | ADMIN | `partners.review` |  | View partner detail | /admin/partners | 9 |
| PATCH | `/api/v1/admin/partners/{id}/status` | ADMIN | `partners.review` |  | Approve/reject/suspend partner | /admin/partners | 9 |
| GET | `/api/v1/admin/partners/{id}/documents` | ADMIN | `partners.review` |  | View verification documents | /admin/partners | 9 |

## Accommodation (5)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/properties` | P |  |  | Search accommodation | /stays, /stays/[slug] | 5 |
| GET | `/api/v1/properties/{slug}` | P |  |  | Read property | /stays, /stays/[slug] | 5 |
| GET | `/api/v1/properties/{id}/rooms` | P |  |  | List room types | /stays, /stays/[slug] | 5 |
| GET | `/api/v1/properties/{id}/availability` | P |  |  | Check dates, guests and prices | /stays, /stays/[slug] | 5 |
| GET | `/api/v1/amenities` | P |  |  | List amenities | /stays, /stays/[slug] | 5 |

## Partner: Accommodation (15)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/properties` | PARTNER | `properties.manage.own` | X-Partner-Id | List owned properties | /partner/properties, /partner/rooms | 8 |
| POST | `/api/v1/partners/me/properties` | PARTNER | `properties.manage.own` | X-Partner-Id | Create property | /partner/properties, /partner/rooms | 8 |
| PATCH | `/api/v1/partners/me/properties/{id}` | PARTNER | `properties.manage.own` | X-Partner-Id | Edit property | /partner/properties, /partner/rooms | 8 |
| PUT | `/api/v1/partners/me/properties/{id}/amenities` | PARTNER | `properties.manage.own` | X-Partner-Id | Assign property amenities | /partner/properties, /partner/rooms | 8 |
| PUT | `/api/v1/partners/me/properties/{id}/policies` | PARTNER | `properties.manage.own` | X-Partner-Id | Edit property policies | /partner/properties, /partner/rooms | 8 |
| POST | `/api/v1/partners/me/properties/{id}/media` | PARTNER | `properties.manage.own` | X-Partner-Id | Attach images | /partner/properties, /partner/rooms | 8 |
| DELETE | `/api/v1/partners/me/properties/{id}/media/{mediaId}` | PARTNER | `properties.manage.own` | X-Partner-Id | Detach image | /partner/properties, /partner/rooms | 8 |
| POST | `/api/v1/partners/me/properties/{id}/rooms` | PARTNER | `properties.manage.own` | X-Partner-Id | Create room type | /partner/properties, /partner/rooms | 8 |
| PATCH | `/api/v1/partners/me/properties/{id}/rooms/{roomId}` | PARTNER | `properties.manage.own` | X-Partner-Id | Edit room type | /partner/properties, /partner/rooms | 8 |
| PATCH | `/api/v1/partners/me/properties/{id}/rooms/{roomId}/status` | PARTNER | `properties.manage.own` | X-Partner-Id | Change room status | /partner/properties, /partner/rooms | 8 |
| POST | `/api/v1/partners/me/properties/{id}/rooms/{roomId}/media` | PARTNER | `properties.manage.own` | X-Partner-Id | Attach room image | /partner/properties, /partner/rooms | 8 |
| DELETE | `/api/v1/partners/me/properties/{id}/rooms/{roomId}/media/{mediaId}` | PARTNER | `properties.manage.own` | X-Partner-Id | Detach room image | /partner/properties, /partner/rooms | 8 |
| PUT | `/api/v1/partners/me/rooms/{roomId}/inventory` | PARTNER | `properties.manage.own` | X-Partner-Id | Write inventory calendar | /partner/properties, /partner/rooms | 8 |
| PUT | `/api/v1/partners/me/rooms/{roomId}/rates` | PARTNER | `properties.manage.own` | X-Partner-Id | Write date-based rate calendar | /partner/properties, /partner/rooms | 8 |
| GET | `/api/v1/partners/me/rooms/{roomId}/calendar` | PARTNER | `properties.manage.own` | X-Partner-Id | Read calendar | /partner/properties, /partner/rooms | 8 |

## Admin: Accommodation (6)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/properties` | ADMIN | `properties.moderate` |  | Approval listing | /admin/properties | 9 |
| GET | `/api/v1/admin/properties/{id}` | ADMIN | `properties.moderate` |  | Property approval detail | /admin/properties | 9 |
| PATCH | `/api/v1/admin/properties/{id}/status` | ADMIN | `properties.moderate` |  | Approve/reject/suspend property | /admin/properties | 9 |
| GET | `/api/v1/admin/amenities` | ADMIN | `amenities.manage` |  | Admin amenity list | /admin/properties | 9 |
| POST | `/api/v1/admin/amenities` | ADMIN | `amenities.manage` |  | Add amenity | /admin/properties | 9 |
| PATCH | `/api/v1/admin/amenities/{id}` | ADMIN | `amenities.manage` |  | Edit amenity | /admin/properties | 9 |

## Guides (5)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/guides` | P |  |  | Search guides | /guides, /guides/[id] | 5 |
| GET | `/api/v1/guides/{id}` | P |  |  | Read guide | /guides, /guides/[id] | 5 |
| GET | `/api/v1/guides/{id}/services` | P |  |  | Read guide services | /guides, /guides/[id] | 5 |
| GET | `/api/v1/guides/{id}/availability` | P |  |  | Read available slots | /guides, /guides/[id] | 5 |
| GET | `/api/v1/languages` | P |  |  | List supported languages | /guides, /guides/[id] | 5 |

## Partner: Guides (10)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/guides` | PARTNER | `guides.manage.own` | X-Partner-Id | List partner guides | /partner/guides | 8 |
| POST | `/api/v1/partners/me/guides` | PARTNER | `guides.manage.own` | X-Partner-Id | Create guide profile | /partner/guides | 8 |
| PATCH | `/api/v1/partners/me/guides/{id}` | PARTNER | `guides.manage.own` | X-Partner-Id | Edit guide profile | /partner/guides | 8 |
| PUT | `/api/v1/partners/me/guides/{id}/languages` | PARTNER | `guides.manage.own` | X-Partner-Id | Set guide languages | /partner/guides | 8 |
| PUT | `/api/v1/partners/me/guides/{id}/destinations` | PARTNER | `guides.manage.own` | X-Partner-Id | Set guide destinations | /partner/guides | 8 |
| POST | `/api/v1/partners/me/guides/{id}/services` | PARTNER | `guides.manage.own` | X-Partner-Id | Create guide service | /partner/guides | 8 |
| PATCH | `/api/v1/partners/me/guides/{id}/services/{serviceId}` | PARTNER | `guides.manage.own` | X-Partner-Id | Edit guide service | /partner/guides | 8 |
| PATCH | `/api/v1/partners/me/guides/{id}/services/{serviceId}/status` | PARTNER | `guides.manage.own` | X-Partner-Id | Set guide service status | /partner/guides | 8 |
| PUT | `/api/v1/partners/me/guides/{id}/availability` | PARTNER | `guides.manage.own` | X-Partner-Id | Update guide availability | /partner/guides | 8 |
| POST | `/api/v1/partners/me/guides/{id}/documents` | PARTNER | `guides.manage.own` | X-Partner-Id | Submit verification documents | /partner/guides | 8 |

## Admin: Guides (7)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/guides` | ADMIN | `guides.verify` |  | Verification/moderation list | /admin/guides | 9 |
| GET | `/api/v1/admin/guides/{id}` | ADMIN | `guides.verify` |  | Guide review detail | /admin/guides | 9 |
| PATCH | `/api/v1/admin/guides/{id}/verification` | ADMIN | `guides.verify` |  | Approve/reject verification | /admin/guides | 9 |
| PATCH | `/api/v1/admin/guides/{id}/status` | ADMIN | `guides.verify` |  | Activate/suspend guide | /admin/guides | 9 |
| GET | `/api/v1/admin/languages` | ADMIN | `languages.manage` |  | Manage language list | /admin/guides | 9 |
| POST | `/api/v1/admin/languages` | ADMIN | `languages.manage` |  | Add supported language | /admin/guides | 9 |
| PATCH | `/api/v1/admin/languages/{id}` | ADMIN | `languages.manage` |  | Update language | /admin/guides | 9 |

## Experiences (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/experiences` | P |  |  | List experiences | /experiences, /experiences/[slug] | 5 |
| GET | `/api/v1/experiences/{slug}` | P |  |  | Read experience | /experiences, /experiences/[slug] | 5 |
| GET | `/api/v1/experiences/{id}/sessions` | P |  |  | List sessions | /experiences, /experiences/[slug] | 5 |
| GET | `/api/v1/experiences/{id}/availability` | P |  |  | Check seats | /experiences, /experiences/[slug] | 5 |

## Partner: Experiences (8)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/experiences` | PARTNER | `experiences.manage.own` | X-Partner-Id | List partner experiences | /partner/experiences | 8 |
| POST | `/api/v1/partners/me/experiences` | PARTNER | `experiences.manage.own` | X-Partner-Id | Create experience | /partner/experiences | 8 |
| PATCH | `/api/v1/partners/me/experiences/{id}` | PARTNER | `experiences.manage.own` | X-Partner-Id | Edit experience | /partner/experiences | 8 |
| POST | `/api/v1/partners/me/experiences/{id}/sessions` | PARTNER | `experiences.manage.own` | X-Partner-Id | Create session | /partner/experiences | 8 |
| PATCH | `/api/v1/partners/me/experiences/{id}/sessions/{sessionId}` | PARTNER | `experiences.manage.own` | X-Partner-Id | Update session | /partner/experiences | 8 |
| DELETE | `/api/v1/partners/me/experiences/{id}/sessions/{sessionId}` | PARTNER | `experiences.manage.own` | X-Partner-Id | Remove unused session | /partner/experiences | 8 |
| POST | `/api/v1/partners/me/experiences/{id}/media` | PARTNER | `experiences.manage.own` | X-Partner-Id | Attach media | /partner/experiences | 8 |
| DELETE | `/api/v1/partners/me/experiences/{id}/media/{mediaId}` | PARTNER | `experiences.manage.own` | X-Partner-Id | Detach media | /partner/experiences | 8 |

## Admin: Experiences (2)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/experiences` | ADMIN | `experiences.moderate` |  | Moderation listing | /admin/experiences | 9 |
| PATCH | `/api/v1/admin/experiences/{id}/status` | ADMIN | `experiences.moderate` |  | Approve, publish or reject | /admin/experiences | 9 |

## Packages (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/packages` | P |  |  | Browse packages | /packages, /packages/[slug] | 5 |
| GET | `/api/v1/packages/{slug}` | P |  |  | Read package | /packages, /packages/[slug] | 5 |
| GET | `/api/v1/packages/{id}/departures` | P |  |  | List package departures | /packages, /packages/[slug] | 5 |
| GET | `/api/v1/packages/{id}/availability` | P |  |  | Get departure capacity | /packages, /packages/[slug] | 5 |

## Partner: Packages (10)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/packages` | PARTNER | `packages.manage.own` | X-Partner-Id | List owned packages | /partner/packages | 8 |
| POST | `/api/v1/partners/me/packages` | PARTNER | `packages.manage.own` | X-Partner-Id | Create package | /partner/packages | 8 |
| PATCH | `/api/v1/partners/me/packages/{id}` | PARTNER | `packages.manage.own` | X-Partner-Id | Edit package | /partner/packages | 8 |
| PUT | `/api/v1/partners/me/packages/{id}/destinations` | PARTNER | `packages.manage.own` | X-Partner-Id | Set linked destinations | /partner/packages | 8 |
| PUT | `/api/v1/partners/me/packages/{id}/itinerary` | PARTNER | `packages.manage.own` | X-Partner-Id | Save ordered days and activities | /partner/packages | 8 |
| PUT | `/api/v1/partners/me/packages/{id}/inclusions` | PARTNER | `packages.manage.own` | X-Partner-Id | Save included/excluded items | /partner/packages | 8 |
| POST | `/api/v1/partners/me/packages/{id}/media` | PARTNER | `packages.manage.own` | X-Partner-Id | Attach gallery | /partner/packages | 8 |
| DELETE | `/api/v1/partners/me/packages/{id}/media/{mediaId}` | PARTNER | `packages.manage.own` | X-Partner-Id | Detach image | /partner/packages | 8 |
| POST | `/api/v1/partners/me/packages/{id}/departures` | PARTNER | `packages.manage.own` | X-Partner-Id | Create departure | /partner/packages | 8 |
| PATCH | `/api/v1/partners/me/packages/{id}/departures/{departureId}` | PARTNER | `packages.manage.own` | X-Partner-Id | Edit departure | /partner/packages | 8 |

## Admin: Packages (2)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/packages` | ADMIN | `packages.moderate` |  | Moderation listing | /admin/packages | 9 |
| PATCH | `/api/v1/admin/packages/{id}/status` | ADMIN | `packages.moderate` |  | Approve/publish/reject | /admin/packages | 9 |

## Bookings (7)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/bookings/quote` | U | `bookings.create.own` |  | Recompute authoritative price and availability | Booking widget on supply detail pages | 6 |
| POST | `/api/v1/bookings` | U | `bookings.create.own` | Idempotency-Key (required) | Create booking or approval request | Booking widget -> /checkout/[bookingId] | 6 |
| GET | `/api/v1/bookings` | U | `bookings.read.own` |  | List own bookings | /account/bookings, /account/bookings/[id], /checkout | 6-7 |
| GET | `/api/v1/bookings/{id}` | U | `bookings.read.own` |  | Get own booking detail | /account/bookings, /account/bookings/[id], /checkout | 6-7 |
| GET | `/api/v1/bookings/{id}/status` | U | `bookings.read.own` |  | Read current booking/payment state | /account/bookings, /account/bookings/[id], /checkout | 6-7 |
| POST | `/api/v1/bookings/{id}/cancel` | U | `bookings.cancel.own` |  | Request/perform cancellation | /account/bookings, /account/bookings/[id], /checkout | 6-7 |
| GET | `/api/v1/bookings/{id}/documents` | U | `bookings.read.own` |  | Retrieve permitted booking documents | /account/bookings, /account/bookings/[id], /checkout | 6-7 |

## Partner: Bookings (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/bookings` | PARTNER | `bookings.manage.partner` | X-Partner-Id | Bookings for partner-owned supply | /partner/bookings | 8 |
| GET | `/api/v1/partners/me/bookings/{id}` | PARTNER | `bookings.manage.partner` | X-Partner-Id | Get partner booking detail | /partner/bookings | 8 |
| POST | `/api/v1/partners/me/bookings/{id}/approve` | PARTNER | `bookings.manage.partner` | X-Partner-Id | Approve request-to-book | /partner/bookings | 8 |
| POST | `/api/v1/partners/me/bookings/{id}/reject` | PARTNER | `bookings.manage.partner` | X-Partner-Id | Reject request-to-book | /partner/bookings | 8 |

## Admin: Bookings (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/bookings` | ADMIN | `bookings.read.platform` |  | Search all bookings | /admin/bookings | 9 |
| GET | `/api/v1/admin/bookings/{id}` | ADMIN | `bookings.read.platform` |  | View full booking | /admin/bookings | 9 |
| POST | `/api/v1/admin/bookings/{id}/cancel` | ADMIN | `bookings.manage.platform` |  | Authorized cancellation | /admin/bookings | 9 |
| POST | `/api/v1/admin/bookings/{id}/refund` | ADMIN | `refunds.initiate` | Idempotency-Key (required) | Authorized refund action | /admin/bookings | 9 |

## Payments (5)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/bookings/{id}/payment-order` | U | `payments.create.own` | Idempotency-Key (required) | Initiate payment once eligible | /checkout/[bookingId] | 6 |
| GET | `/api/v1/payments/orders/{id}` | U | `payments.read.own` |  | Read payment order | /account/bookings/[id] (payments, refunds) | 6-7 |
| GET | `/api/v1/payments/booking/{bookingId}` | U | `payments.read.own` |  | Read booking payment history | /account/bookings/[id] (payments, refunds) | 6-7 |
| POST | `/api/v1/payments/verify` | U | `payments.create.own` |  | Check gateway transaction signature/status | /checkout -> /payments/result | 6 |
| GET | `/api/v1/refunds/{id}` | U | `payments.read.own` |  | Read refund status | /account/bookings/[id] (payments, refunds) | 6-7 |

## Webhooks (1)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| POST | `/api/v1/webhooks/payments/{provider}` | WEBHOOK |  |  | Receive gateway-verified webhook | Not called by frontend (Razorpay to public edge) | - |

## Admin: Payments (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/payments` | ADMIN | `payments.read.platform` |  | Search platform payments | /admin/payments | 9 |
| GET | `/api/v1/admin/refunds` | ADMIN | `payments.read.platform` |  | Search refunds | /admin/refunds | 9 |
| POST | `/api/v1/admin/refunds/{id}/retry` | ADMIN | `refunds.retry` |  | Retry eligible refund | /admin/refunds | 9 |

## Notifications (4)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/notifications` | U | `notifications.read.own` |  | Read in-app inbox | /account/notifications, header badge | 7 |
| GET | `/api/v1/notifications/unread-count` | U | `notifications.read.own` |  | Get unread count | /account/notifications, header badge | 7 |
| PATCH | `/api/v1/notifications/{id}/read` | U | `notifications.read.own` |  | Mark own item read | /account/notifications, header badge | 7 |
| POST | `/api/v1/notifications/read-all` | U | `notifications.read.own` |  | Mark all own items read | /account/notifications, header badge | 7 |

## Admin: Notifications (2)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/notification-templates` | ADMIN | `notification_templates.manage` |  | List templates | /admin/notifications | 9 |
| PATCH | `/api/v1/admin/notification-templates/{id}` | ADMIN | `notification_templates.manage` |  | Edit template | /admin/notifications | 9 |

## Trip planner (12)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/trips` | U | `trips.manage.own` |  | List own trips | /account/trips | 7 |
| POST | `/api/v1/trips` | U | `trips.manage.own` |  | Create trip | /account/trips | 7 |
| GET | `/api/v1/trips/{id}` | U | `trips.manage.own` |  | Read trip | /account/trips | 7 |
| PATCH | `/api/v1/trips/{id}` | U | `trips.manage.own` |  | Edit trip | /account/trips | 7 |
| DELETE | `/api/v1/trips/{id}` | U | `trips.manage.own` |  | Delete draft trip | /account/trips | 7 |
| POST | `/api/v1/trips/{id}/days` | U | `trips.manage.own` |  | Add itinerary day | /account/trips | 7 |
| PATCH | `/api/v1/trips/{id}/days/{dayId}` | U | `trips.manage.own` |  | Edit itinerary day | /account/trips | 7 |
| DELETE | `/api/v1/trips/{id}/days/{dayId}` | U | `trips.manage.own` |  | Remove day | /account/trips | 7 |
| POST | `/api/v1/trips/{id}/days/{dayId}/stops` | U | `trips.manage.own` |  | Add day stop | /account/trips | 7 |
| PATCH | `/api/v1/trips/{id}/stops/reorder` | U | `trips.manage.own` |  | Reorder stops | /account/trips | 7 |
| PATCH | `/api/v1/trips/{id}/stops/{stopId}` | U | `trips.manage.own` |  | Edit stop | /account/trips | 7 |
| DELETE | `/api/v1/trips/{id}/stops/{stopId}` | U | `trips.manage.own` |  | Delete stop | /account/trips | 7 |

## Favorites (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/favorites` | U | `favorites.manage.own` |  | List favorites | /account/favorites, save buttons | 7 |
| POST | `/api/v1/favorites` | U | `favorites.manage.own` |  | Save item | /account/favorites, save buttons | 7 |
| DELETE | `/api/v1/favorites/{type}/{id}` | U | `favorites.manage.own` |  | Remove saved item | /account/favorites, save buttons | 7 |

## Destinations, Reviews (1)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/destinations/{slug}/reviews` | P |  |  | List destination reviews | /destinations/[slug] (reviews) | 4 |

## Reviews (5)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/reviews` | P |  |  | List reviews of an item | Review list/forms on detail pages, /account | 5-7 |
| POST | `/api/v1/reviews` | U | `reviews.write.own` |  | Write review | Review list/forms on detail pages, /account | 5-7 |
| PATCH | `/api/v1/reviews/{id}` | U | `reviews.write.own` |  | Edit own review | Review list/forms on detail pages, /account | 5-7 |
| DELETE | `/api/v1/reviews/{id}` | U | `reviews.write.own` |  | Delete own review | Review list/forms on detail pages, /account | 5-7 |
| GET | `/api/v1/users/me/reviews` | U | `reviews.write.own` |  | List own reviews | /account (reviews) | 7 |

## Admin: Reviews (2)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/reviews` | ADMIN | `reviews.moderate` |  | Moderation queue | /admin/reviews | 9 |
| PATCH | `/api/v1/admin/reviews/{id}/status` | ADMIN | `reviews.moderate` |  | Moderate review | /admin/reviews | 9 |

## Admin: Reports (5)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/dashboard` | ADMIN | `reports.read.platform` |  | Platform dashboard | /admin, /admin/reports | 9 |
| GET | `/api/v1/admin/reports/bookings` | ADMIN | `reports.read.platform` |  | Bookings report | /admin, /admin/reports | 9 |
| GET | `/api/v1/admin/reports/revenue` | ADMIN | `reports.read.platform` |  | Revenue report | /admin, /admin/reports | 9 |
| GET | `/api/v1/admin/reports/destinations` | ADMIN | `reports.read.platform` |  | Destination performance | /admin, /admin/reports | 9 |
| GET | `/api/v1/admin/reports/partners` | ADMIN | `reports.read.platform` |  | Partner performance | /admin, /admin/reports | 9 |

## Partner reports (3)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/partners/me/dashboard` | PARTNER | `reports.read.partner` | X-Partner-Id | Partner dashboard | /partner, /partner/reports | 8 |
| GET | `/api/v1/partners/me/reports/bookings` | PARTNER | `reports.read.partner` | X-Partner-Id | Own bookings report | /partner, /partner/reports | 8 |
| GET | `/api/v1/partners/me/reports/revenue` | PARTNER | `reports.read.partner` | X-Partner-Id | Own revenue report | /partner, /partner/reports | 8 |

## Admin: Settings (2)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/settings` | ADMIN | `settings.read` |  | Read platform settings | /admin/settings | 9 |
| PATCH | `/api/v1/admin/settings` | ADMIN | `settings.write` |  | Change platform settings | /admin/settings | 9 |

## Admin: Audit (1)

| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |
|--------|------|------|---------------|---------|---------|-------------------|-------|
| GET | `/api/v1/admin/audit-logs` | ADMIN | `audit.read` |  | Search audit logs | /admin/audit-logs | 9 |

