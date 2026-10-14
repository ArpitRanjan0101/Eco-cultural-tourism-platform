-- System RBAC catalog (Report §7). Kept in a migration, not a re-runnable seed, so
-- administrator changes to grants are never silently reverted. Later phases add
-- permissions/grants in new migrations. super_admin always holds every permission.

INSERT INTO roles (code, name, description) VALUES
  ('tourist',          'Tourist',           'Registered traveller: own profile, trips, favorites, reviews, bookings and payments'),
  ('guide',            'Guide',             'Local guide managing their guide profile, services, slots and entitled bookings'),
  ('hotel_partner',    'Hotel partner',     'Accommodation partner managing owned properties, rooms, inventory and rates'),
  ('package_provider', 'Package provider',  'Operator managing owned packages, experiences and related reservations'),
  ('admin',            'Administrator',     'Moderation, CMS publishing and operational bookings, subject to permission codes'),
  ('super_admin',      'Super administrator','RBAC management, platform settings and audited administrative override');

INSERT INTO permissions (module, code, description) VALUES
  ('users',         'users.read',                     'Search and view user accounts'),
  ('users',         'users.manage',                   'Suspend or reactivate user accounts'),
  ('rbac',          'roles.read',                     'View roles and permissions'),
  ('rbac',          'roles.assign',                   'Assign roles to users'),
  ('rbac',          'roles.manage',                   'Change the permissions granted to a role'),
  ('audit',         'audit.read',                     'Search audit logs'),
  ('settings',      'settings.read',                  'Read platform settings'),
  ('settings',      'settings.write',                 'Change platform settings'),
  ('geography',     'geography.manage',               'Manage regions, districts and destination categories'),
  ('destinations',  'destinations.read',              'View destinations including drafts'),
  ('destinations',  'destinations.manage',            'Create, edit and archive destinations'),
  ('destinations',  'destinations.publish',           'Publish or unpublish destinations'),
  ('experiences',   'experiences.manage.own',         'Manage experiences owned by the partner organisation'),
  ('experiences',   'experiences.moderate',           'Approve, publish or reject experiences'),
  ('properties',    'properties.manage.own',          'Manage properties, rooms, inventory and rates owned by the partner organisation'),
  ('properties',    'properties.moderate',            'Approve, reject or suspend properties'),
  ('properties',    'amenities.manage',               'Manage the amenity catalogue'),
  ('guides',        'guides.manage.own',              'Manage guide profiles, services and availability owned by the partner organisation'),
  ('guides',        'guides.verify',                  'Verify, activate or suspend guides'),
  ('guides',        'languages.manage',               'Manage supported guide languages'),
  ('packages',      'packages.manage.own',            'Manage packages and departures owned by the partner organisation'),
  ('packages',      'packages.moderate',              'Approve, publish or reject packages'),
  ('partners',      'partners.apply',                 'Submit a partner application'),
  ('partners',      'partners.manage.own',            'Manage own partner organisation, team and documents'),
  ('partners',      'partners.review',                'Review, approve, reject or suspend partners'),
  ('bookings',      'bookings.create.own',            'Request quotes and create own bookings'),
  ('bookings',      'bookings.read.own',              'View own bookings and documents'),
  ('bookings',      'bookings.cancel.own',            'Cancel own bookings'),
  ('bookings',      'bookings.manage.partner',        'View and approve/reject bookings for owned supply'),
  ('bookings',      'bookings.read.platform',         'View all bookings'),
  ('bookings',      'bookings.manage.platform',       'Cancel bookings on behalf of the platform'),
  ('payments',      'payments.create.own',            'Create and verify payments for own bookings'),
  ('payments',      'payments.read.own',              'View own payment and refund status'),
  ('payments',      'payments.read.platform',         'Search all payments and refunds'),
  ('payments',      'refunds.initiate',               'Authorise refunds (elevated financial action)'),
  ('payments',      'refunds.retry',                  'Retry failed refunds (elevated financial action)'),
  ('trips',         'trips.manage.own',               'Manage own saved trips'),
  ('reviews',       'reviews.write.own',              'Create, edit and delete own reviews'),
  ('reviews',       'reviews.moderate',               'Approve, hide or reject reviews'),
  ('favorites',     'favorites.manage.own',           'Manage own favorites'),
  ('cms',           'cms.manage',                     'Edit CMS pages, menus, redirects and announcements'),
  ('cms',           'cms.publish',                    'Publish or archive CMS pages'),
  ('media',         'media.upload',                   'Upload media assets'),
  ('media',         'media.manage',                   'Manage any media asset'),
  ('notifications', 'notifications.read.own',         'Read own in-app notifications'),
  ('notifications', 'notification_templates.manage',  'Edit notification templates'),
  ('reports',       'reports.read.platform',          'View platform dashboards and reports'),
  ('reports',       'reports.read.partner',           'View partner dashboards and reports');

WITH grants (role_code, permission_code) AS (
  VALUES
    -- Tourist baseline (also inherited by partner roles below).
    ('tourist', 'bookings.create.own'), ('tourist', 'bookings.read.own'), ('tourist', 'bookings.cancel.own'),
    ('tourist', 'payments.create.own'), ('tourist', 'payments.read.own'), ('tourist', 'trips.manage.own'),
    ('tourist', 'reviews.write.own'), ('tourist', 'favorites.manage.own'), ('tourist', 'notifications.read.own'),
    ('tourist', 'partners.apply'), ('tourist', 'media.upload'),
    -- Supply-specific partner grants; organisation ownership is checked separately on every request.
    ('guide', 'guides.manage.own'),
    ('hotel_partner', 'properties.manage.own'),
    ('package_provider', 'experiences.manage.own'), ('package_provider', 'packages.manage.own'),
    -- Administrator: moderation and operations; no RBAC, settings or refund authority by default.
    ('admin', 'users.read'), ('admin', 'users.manage'), ('admin', 'roles.read'), ('admin', 'audit.read'),
    ('admin', 'settings.read'), ('admin', 'geography.manage'), ('admin', 'destinations.read'),
    ('admin', 'destinations.manage'), ('admin', 'destinations.publish'), ('admin', 'experiences.moderate'),
    ('admin', 'properties.moderate'), ('admin', 'amenities.manage'), ('admin', 'guides.verify'),
    ('admin', 'languages.manage'), ('admin', 'packages.moderate'), ('admin', 'partners.review'),
    ('admin', 'bookings.read.platform'), ('admin', 'bookings.manage.platform'), ('admin', 'payments.read.platform'),
    ('admin', 'reviews.moderate'), ('admin', 'cms.manage'), ('admin', 'cms.publish'), ('admin', 'media.upload'),
    ('admin', 'media.manage'), ('admin', 'notification_templates.manage'), ('admin', 'reports.read.platform'),
    ('admin', 'notifications.read.own')
),
partner_common (permission_code) AS (
  VALUES ('partners.manage.own'), ('bookings.manage.partner'), ('reports.read.partner')
),
expanded AS (
  SELECT role_code, permission_code FROM grants
  UNION
  SELECT p.role_code, g.permission_code
  FROM (VALUES ('guide'), ('hotel_partner'), ('package_provider')) AS p (role_code)
  CROSS JOIN (SELECT permission_code FROM grants WHERE role_code = 'tourist' UNION SELECT permission_code FROM partner_common) AS g
  UNION
  SELECT 'super_admin', code FROM permissions
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM expanded e
JOIN roles r ON r.code = e.role_code
JOIN permissions p ON p.code = e.permission_code;
