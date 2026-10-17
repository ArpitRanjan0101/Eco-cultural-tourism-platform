import Section from '@/components/layout/Section';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/**
 * `home_search`: entry to unified search. A plain GET form to /search (works without JavaScript); results come
 * from GET /search on that page.
 * @param {{ heading: string, subheading?: string|null, placeholder?: string|null, sectionId: string }} props
 */
export default function HomeSearchSection({ heading, subheading, placeholder, sectionId }) {
  return (
    <Section id={sectionId} title={heading} description={subheading ?? undefined} tone="muted" spacing="md">
      <form action="/search" method="get" role="search" aria-label={heading} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input label="Search destinations, stays, guides and more" name="q" type="search" size="lg" required maxLength={100} placeholder={placeholder ?? undefined} />
        </div>
        <Button type="submit" size="lg">
          Search
        </Button>
      </form>
    </Section>
  );
}
