// Public, non-secret site identity. Safe for client and server code.
export const site = Object.freeze({
  name: 'Jharkhand Eco & Cultural Tourism',
  shortName: 'Jharkhand Tourism',
  description: 'Discover the nature, heritage and living cultures of Jharkhand.',
  locale: 'en-IN',
  // CMS menu codes rendered in the header and footer (created by admins under /admin/cms/menus).
  menus: Object.freeze({ header: 'main', footer: 'footer' }),
  // Used only while the CMS menu is missing (gap G5): the site's own main sections, nothing invented.
  fallbackNav: Object.freeze([
    { id: 'destinations', label: 'Destinations', href: '/destinations' },
    { id: 'stays', label: 'Stays', href: '/stays' },
    { id: 'experiences', label: 'Experiences', href: '/experiences' },
    { id: 'guides', label: 'Guides', href: '/guides' },
    { id: 'packages', label: 'Packages', href: '/packages' },
  ]),
});
