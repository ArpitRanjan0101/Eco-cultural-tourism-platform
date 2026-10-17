import CardGrid from '@/components/data-display/CardGrid';
import EmptyState from '@/components/feedback/EmptyState';
import DestinationCard from './DestinationCard';

/**
 * Responsive grid of API destination cards, with a real empty state.
 * @param {{ destinations: Array<object>, label?: string, columns?: 2|3|4, emptyTitle?: string,
 *   emptyDescription?: string, emptyAction?: React.ReactNode, showDistance?: boolean }} props
 */
export default function DestinationGrid({
  destinations,
  label = 'Destinations',
  columns = 3,
  emptyTitle = 'No destinations found',
  emptyDescription = 'Try removing a filter or searching for another place.',
  emptyAction,
  showDistance = false,
}) {
  if (!destinations.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return (
    <CardGrid
      items={destinations}
      getKey={(destination) => destination.id}
      columns={columns}
      label={label}
      renderItem={(destination) => <DestinationCard destination={destination} showDistance={showDistance} />}
    />
  );
}
