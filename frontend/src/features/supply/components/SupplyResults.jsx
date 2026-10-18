import CardGrid from '@/components/data-display/CardGrid';
import EmptyState from '@/components/feedback/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

/**
 * Result cards, or a real empty state that says whether filters are hiding results (W22).
 * @param {{ items: Array<{ id: string }>, renderItem: (item) => React.ReactNode, label: string, noun: string,
 *   filtered: boolean, clearHref: string, columns?: 2|3|4 }} props `noun` is plural ("stays").
 */
export default function SupplyResults({ items, renderItem, label, noun, filtered, clearHref, columns = 3 }) {
  if (!items.length) {
    return filtered ? (
      <EmptyState
        title={`No ${noun} match these filters`}
        description="Try another search term or remove a filter."
        action={
          <ButtonLink href={clearHref} variant="outline">
            Clear filters
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState title={`No ${noun} are listed yet`} description="Partners are adding more across Jharkhand — please check back soon." />
    );
  }
  return <CardGrid items={items} getKey={(item) => item.id} columns={columns} label={label} renderItem={renderItem} />;
}
