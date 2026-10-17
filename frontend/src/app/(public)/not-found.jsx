import Container from '@/components/layout/Container';
import EmptyState from '@/components/feedback/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Page not found' };

// Unknown or unpublished public pages (destinations, districts, CMS pages) inside the site chrome.
export default function PublicNotFound() {
  return (
    <Container className="py-16">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="We couldn't find that page"
        description="It may have moved, or it isn't published. Try searching or browse destinations."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/search">Search</ButtonLink>
            <ButtonLink href="/destinations" variant="outline">
              Browse destinations
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}
