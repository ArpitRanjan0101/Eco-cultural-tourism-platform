import SearchFilterForm from './SearchFilterForm';

/** Desktop filter column (hidden below `lg`, where MobileFilterDrawer takes over). */
export default function FilterSidebar({ filters, params }) {
  return (
    <aside aria-labelledby="filters-heading" className="hidden lg:block">
      <div className="sticky top-20 flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4">
        <h2 id="filters-heading" className="font-sans text-base font-semibold">
          Filters
        </h2>
        <SearchFilterForm filters={filters} params={params} idPrefix="sidebar" />
      </div>
    </aside>
  );
}
