import CardGrid from '@/components/data-display/CardGrid';
import EmptyState from '@/components/feedback/EmptyState';
import DistrictCard from './DistrictCard';

/**
 * Grid of API districts; real empty state when none match.
 * @param {{ districts: Array<object>, label?: string, emptyAction?: React.ReactNode }} props
 */
export default function DistrictGrid({ districts, label = 'Districts', emptyAction }) {
  if (!districts.length) return <EmptyState title="No districts found" description="No active districts match this selection." action={emptyAction} />;
  return <CardGrid items={districts} getKey={(district) => district.id} columns={4} label={label} renderItem={(district) => <DistrictCard district={district} />} />;
}
