import EmptyState from '@/components/feedback/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

/**
 * No results (or no query yet), with the next useful step.
 * @param {{ q?: string, filtered?: boolean, clearHref?: string, reason?: 'no-query'|'too-short'|'no-results' }} props
 */
export default function SearchEmptyState({ q, filtered = false, clearHref, reason = 'no-results' }) {
  if (reason === 'no-query') {
    return <EmptyState title="What are you looking for?" description="Search for a destination, district, stay, guide, experience or package." action={<ButtonLink href="/explore" variant="outline">Explore Jharkhand</ButtonLink>} />;
  }
  if (reason === 'too-short') return <EmptyState title="Type at least 2 characters" description="Short searches match too much. Add another letter or two." />;
  return (
    <EmptyState
      title={`No results for “${q}”`}
      description={filtered ? 'Your filters may be too narrow — they apply to destinations only.' : 'Check the spelling or try a broader term, such as a district or a type of place.'}
      action={filtered && clearHref ? <ButtonLink href={clearHref} variant="outline">Remove filters</ButtonLink> : <ButtonLink href="/destinations" variant="outline">Browse all destinations</ButtonLink>}
    />
  );
}
