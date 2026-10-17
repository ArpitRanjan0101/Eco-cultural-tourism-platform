import Select from '@/components/ui/Select';

/**
 * Category filter control for GET filter forms (field name `category`, value = category slug).
 * @param {{ categories: Array<{ slug: string, name: string }>, value?: string, label?: string, name?: string }} props
 */
export default function CategorySelector({ categories, value, label = 'Type of place', name = 'category' }) {
  return (
    <Select
      label={label}
      name={name}
      defaultValue={value ?? ''}
      placeholder="All types"
      options={categories.map((category) => ({ value: category.slug, label: category.name }))}
    />
  );
}
