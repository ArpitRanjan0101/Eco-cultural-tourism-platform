import Section from '@/components/layout/Section';
import { GlobalSearch } from '@/features/search';

/**
 * `home_search`: the shared search entry (autocomplete, GET /search fallback without JavaScript).
 * @param {{ heading: string, subheading?: string|null, placeholder?: string|null, sectionId: string }} props
 */
export default function HomeSearchSection({ heading, subheading, placeholder, sectionId }) {
  return (
    <Section id={sectionId} title={heading} description={subheading ?? undefined} tone="muted" spacing="md">
      <GlobalSearch placeholder={placeholder ?? undefined} />
    </Section>
  );
}
