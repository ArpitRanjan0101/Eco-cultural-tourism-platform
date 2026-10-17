import SortSelector from '@/components/navigation/SortSelector';
import { sortOptions } from '../schemas/destinationQuery';

/**
 * Destination sort, limited to the sorts the backend supports (advertised by /search/filters).
 * @param {{ advertised?: string[], value?: string, params: Record<string,string>, action: string }} props
 */
export default function DestinationSort({ advertised, value, params, action }) {
  return <SortSelector options={sortOptions(advertised)} value={value ?? 'name'} params={params} action={action} />;
}
