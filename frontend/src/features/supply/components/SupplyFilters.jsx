import FilterToolbar from '@/components/data-display/FilterToolbar';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

/**
 * Catalogue filters as a GET form (URL state, W42): a name search plus the select filters the list operation
 * supports. URL-only filters in `keep` (e.g. the current sort, or a destination chosen from a destination page)
 * travel as hidden fields so applying filters never drops them; the page always resets.
 * @param {{ label: string, action: string, values: Record<string,string>, searchLabel?: string,
 *   selects?: Array<{ name: string, label: string, placeholder: string, options: Array<{ value: string, label: string }> }>,
 *   keep?: string[] }} props
 */
export default function SupplyFilters({ label, action, values, searchLabel = 'Search by name', selects = [], keep = ['sort', 'destination'] }) {
  return (
    <FilterToolbar label={label} action={action} submitLabel="Apply filters">
      <Input label={searchLabel} name="q" type="search" defaultValue={values.q ?? ''} minLength={2} maxLength={100} />
      {selects.map((select) => (
        <Select key={select.name} label={select.label} name={select.name} defaultValue={values[select.name] ?? ''} placeholder={select.placeholder} options={select.options} />
      ))}
      {keep.map((name) => (values[name] ? <input key={name} type="hidden" name={name} value={values[name]} /> : null))}
    </FilterToolbar>
  );
}
