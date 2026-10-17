import FilterToolbar from '@/components/data-display/FilterToolbar';
import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

/**
 * Destination filters as a GET form (URL state). Only filters the API supports: q, district, region,
 * category, featured. The current sort is kept; the page resets.
 * @param {{ action: string, values: Record<string,string>, regions: Array<{ slug: string, name: string,
 *   districts: Array<{ slug: string, name: string }> }>, categories: Array<{ slug: string, name: string }>,
 *   showLocation?: boolean }} props
 * `regions` is the /search/filters tree; `showLocation` false hides district/region (e.g. inside a district page).
 */
export default function DestinationFilters({ action, values, regions, categories, showLocation = true }) {
  const districtOptions = regions.flatMap((region) => region.districts.map((district) => ({ value: district.slug, label: `${district.name} (${region.name})` })));
  return (
    <FilterToolbar label="Filter destinations" action={action} submitLabel="Apply filters">
      <Input label="Search by name" name="q" type="search" defaultValue={values.q ?? ''} minLength={2} maxLength={100} />
      {showLocation ? (
        <>
          <Select label="District" name="district" defaultValue={values.district ?? ''} placeholder="All districts" options={districtOptions} />
          <Select label="Region" name="region" defaultValue={values.region ?? ''} placeholder="All regions" options={regions.map((region) => ({ value: region.slug, label: region.name }))} />
        </>
      ) : null}
      <Select label="Type of place" name="category" defaultValue={values.category ?? ''} placeholder="All types" options={categories.map((category) => ({ value: category.slug, label: category.name }))} />
      <div className="flex items-end pb-2">
        <Checkbox label="Featured only" name="featured" value="true" defaultChecked={values.featured === 'true'} />
      </div>
      {values.sort ? <input type="hidden" name="sort" value={values.sort} /> : null}
    </FilterToolbar>
  );
}
