import PublicFooter from '@/components/layout/PublicFooter';
import PublicHeader from '@/components/layout/PublicHeader';
import SiteAnnouncement from '@/components/layout/SiteAnnouncement';
import { getAnnouncements, getMenu } from '@/cms/adapters/cms.adapter';
import { toNavItems } from '@/cms/links';
import { site } from '@/config/site';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ADMIN_AREA_PERMISSIONS, hasPermissions } from '@/lib/permissions/permissionGate';

function accountItems(user) {
  if (!user) {
    return [
      { id: 'login', label: 'Sign in', href: '/login' },
      { id: 'register', label: 'Create account', href: '/register', primary: true },
    ];
  }
  return [
    ...(hasPermissions(user, ADMIN_AREA_PERMISSIONS, 'any') ? [{ id: 'admin', label: 'Admin', href: '/admin' }] : []),
    { id: 'account', label: 'My account', href: '/account', primary: true },
  ];
}

const navFrom = (menu, fallback) => {
  const items = menu ? toNavItems(menu.items) : [];
  return items.length ? items : fallback.map((item) => ({ ...item, external: false, children: [] }));
};

// Public chrome: CMS header/footer menus (fallback to the site's main sections while none exist, G5), active
// announcements and account actions. Menu/announcement failures degrade instead of breaking the page.
export default async function PublicLayout({ children }) {
  const [header, footer, announcements, user] = await Promise.all([
    getMenu(site.menus.header),
    getMenu(site.menus.footer),
    getAnnouncements(),
    getCurrentUser().catch(() => null),
  ]);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteAnnouncement announcements={announcements} />
      <PublicHeader siteName={site.name} navItems={navFrom(header, site.fallbackNav)} accountItems={accountItems(user)} />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <PublicFooter siteName={site.name} description={site.description} items={navFrom(footer, site.fallbackNav)} />
    </div>
  );
}
