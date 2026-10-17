'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useDismiss } from '@/hooks/useDismiss';
import { useSearchSuggestions } from '../hooks/useSearchSuggestions';
import { suggestionHref } from '../schemas/searchQuery';
import SearchSuggestions from './SearchSuggestions';

/**
 * Search entry with autocomplete (WAI-ARIA combobox): ↓/↑ move through suggestions, Enter opens the active one
 * or submits the search, Escape closes. A plain GET form to /search, so it works without JavaScript.
 * @param {{ defaultValue?: string, placeholder?: string, label?: string, hidden?: Record<string,string>,
 *   size?: 'md'|'lg', autoFocus?: boolean }} props
 * `hidden` keeps other URL filters (e.g. type) when searching again from the results page.
 */
export default function GlobalSearch({ defaultValue = '', placeholder, label = 'Search destinations, stays, guides and more', hidden = {}, size = 'lg', autoFocus = false }) {
  const id = useId();
  const router = useRouter();
  const [term, setTerm] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapper = useRef(null);
  const refs = useMemo(() => [wrapper], []);
  useDismiss(open, () => setOpen(false), refs);

  const { data = [] } = useSearchSuggestions(term);
  const suggestions = term.trim().length >= 2 ? data.map((item) => ({ ...item, href: suggestionHref(item) })).filter((item) => item.href) : [];
  const expanded = open && suggestions.length > 0;
  const listId = `${id}-suggestions`;

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault();
      setOpen(false);
      router.push(suggestions[active].href);
    }
  };

  return (
    <form action="/search" method="get" role="search" aria-label="Site search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div ref={wrapper} className="relative flex-1">
        <Input
          label={label}
          name="q"
          type="search"
          size={size}
          value={term}
          placeholder={placeholder}
          required
          minLength={2}
          maxLength={100}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-option-${active}` : undefined}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {expanded ? <SearchSuggestions id={listId} suggestions={suggestions} activeIndex={active} label="Suggestions" onPick={() => setOpen(false)} /> : null}
        <p className="sr-only" aria-live="polite">
          {expanded ? `${suggestions.length} suggestions available. Use the arrow keys to choose.` : ''}
        </p>
      </div>
      <Button type="submit" size={size}>
        Search
      </Button>
    </form>
  );
}
