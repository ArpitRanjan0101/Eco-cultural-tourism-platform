import Link from 'next/link';
import { cx } from '@/lib/cx';

const TYPE_TEXT = { destination: 'Destination', district: 'District', category: 'Type of place' };

/**
 * Listbox of autocomplete suggestions (presentational; keyboard state lives in GlobalSearch).
 * @param {{ id: string, suggestions: Array<{ type: string, id: string, name: string, subtitle?: string|null, href: string }>,
 *   activeIndex: number, onPick: () => void, label: string }} props
 */
export default function SearchSuggestions({ id, suggestions, activeIndex, onPick, label }) {
  return (
    <ul id={id} role="listbox" aria-label={label} className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-surface-raised p-1 shadow-lg">
      {suggestions.map((suggestion, index) => (
        <li key={`${suggestion.type}-${suggestion.id}`} id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex}>
          <Link
            href={suggestion.href}
            tabIndex={-1}
            onClick={onPick}
            className={cx('flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm', index === activeIndex ? 'bg-primary-soft text-primary' : 'text-text hover:bg-surface-muted')}
          >
            <span>
              <span className="font-medium">{suggestion.name}</span>
              {suggestion.subtitle ? <span className="block text-xs text-muted">{suggestion.subtitle}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted">{TYPE_TEXT[suggestion.type] ?? suggestion.type}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
