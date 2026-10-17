import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { CategorySelector } from '@/features/geography';

/**
 * The search filters the API supports — region, district, category (destinations only) — as a GET form that
 * keeps q and type. Shared by FilterSidebar (desktop) and MobileFilterDrawer.
 * @param {{ filters: { regions: Array<object>, categories: Array<object> }, params: Record<string,string>, idPrefix: string }} props
 */
export default function SearchFilterForm({ filters, params, idPrefix }) {
  const districtOptions = filters.regions.flatMap((region) => region.districts.map((district) => ({ value: district.slug, label: `${district.name} (${region.name})` })));
  return (
    <form action="/search" method="get" className="flex flex-col gap-4" aria-label="Search filters">
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      {params.type ? <input type="hidden" name="type" value={params.type} /> : null}
      <p className="text-sm text-muted">Location and type filters narrow results to destinations.</p>
      <Select id={`${idPrefix}-region`} label="Region" name="region" defaultValue={params.region ?? ''} placeholder="All regions" options={filters.regions.map((region) => ({ value: region.slug, label: region.name }))} />
      <Select id={`${idPrefix}-district`} label="District" name="district" defaultValue={params.district ?? ''} placeholder="All districts" options={districtOptions} />
      <CategorySelector categories={filters.categories} value={params.category} />
      <Button type="submit">Apply filters</Button>
    </form>
  );
}
