'use client';

import { useRef } from 'react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';

/**
 * Sort control as a GET form: keeps every other URL filter (hidden fields), resets the page, and submits on
 * change when JavaScript runs (the "Sort" button is there without it).
 * @param {{ options: Array<{ value: string, label: string }>, value: string, params: Record<string,string>,
 *   action: string, label?: string }} props
 */
export default function SortSelector({ options, value, params, action, label = 'Sort by' }) {
  const form = useRef(null);
  if (!options.length) return null;
  const hidden = Object.entries(params).filter(([key]) => key !== 'sort' && key !== 'page');
  return (
    <form ref={form} action={action} method="get" className="flex items-end gap-2">
      {hidden.map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}
      <Select label={label} name="sort" size="sm" defaultValue={value} options={options} onChange={() => form.current?.requestSubmit()} />
      <noscript>
        <Button type="submit" size="sm" variant="outline">
          Sort
        </Button>
      </noscript>
    </form>
  );
}
