import { cx } from '@/lib/cx';

const COLUMNS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * Responsive list of cards (semantic list so screen readers announce the count).
 * @param {{ items: Array<object>, getKey: (item) => string, renderItem: (item) => React.ReactNode,
 *   columns?: 2|3|4, label?: string, className?: string }} props
 */
export default function CardGrid({ items, getKey, renderItem, columns = 3, label, className }) {
  return (
    <ul aria-label={label} className={cx('grid grid-cols-1 gap-5', COLUMNS[columns] ?? COLUMNS[3], className)}>
      {items.map((item) => (
        <li key={getKey(item)} className="flex">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
