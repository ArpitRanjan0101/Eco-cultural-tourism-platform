import NavItemLink from '@/components/navigation/NavItemLink';
import { InfoIcon } from '@/components/ui/icons';
import { isExternalHref, isSafeHref } from '@/cms/links';
import Container from './Container';

/**
 * Bar listing the CMS announcements active now (GET /content/announcements). Links must pass the CMS link
 * allowlist or are left out. Renders nothing without announcements.
 * @param {{ announcements: Array<{ id: string, title: string, message: string, link: string|null }> }} props
 */
export default function SiteAnnouncement({ announcements }) {
  if (!announcements?.length) return null;
  return (
    <section aria-label="Announcements" className="bg-accent text-on-accent">
      <Container as="ul" className="flex flex-col gap-1 py-2 text-sm">
        {announcements.map((announcement) => (
          <li key={announcement.id} className="flex flex-wrap items-center justify-center gap-x-2 text-center">
            <InfoIcon className="size-4 shrink-0" />
            <strong>{announcement.title}</strong>
            <span>{announcement.message}</span>
            {isSafeHref(announcement.link) ? (
              <NavItemLink
                item={{ href: announcement.link, label: 'Learn more', external: isExternalHref(announcement.link) }}
                className="font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white"
              />
            ) : null}
          </li>
        ))}
      </Container>
    </section>
  );
}
