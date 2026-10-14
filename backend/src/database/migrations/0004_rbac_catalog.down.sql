DELETE FROM role_permissions;
DELETE FROM user_roles WHERE role_id IN (
  SELECT id FROM roles WHERE code IN ('tourist', 'guide', 'hotel_partner', 'package_provider', 'admin', 'super_admin')
);
DELETE FROM roles WHERE code IN ('tourist', 'guide', 'hotel_partner', 'package_provider', 'admin', 'super_admin');
DELETE FROM permissions;
