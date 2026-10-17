'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { searchService } from '../services/searchService';

/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Autocomplete suggestions for at least 2 typed characters (debounced, cached per term for 60 s). */
export function useSearchSuggestions(term) {
  const q = useDebouncedValue(term.trim());
  return useQuery({
    queryKey: ['search', 'suggestions', q],
    queryFn: ({ signal }) => searchService.suggestions(q, { signal }),
    enabled: q.length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
