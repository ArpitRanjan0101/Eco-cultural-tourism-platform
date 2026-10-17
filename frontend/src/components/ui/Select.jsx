'use client';

import FormField from '@/components/forms/FormField';
import { ChevronDownIcon } from './icons';
import { controlClass } from './Input';

/**
 * Labelled native select (full keyboard and screen-reader support from the platform).
 * @param {{ label: string, options: Array<{ value: string, label: string, disabled?: boolean }>,
 *   placeholder?: string, hint?: string, error?: string, required?: boolean, size?: 'sm'|'md'|'lg',
 *   id?: string, className?: string, ref?: React.Ref }} props
 * `placeholder` adds an empty first option (disabled when `required`).
 */
export default function Select({ label, options, placeholder, hint, error, required, hideLabel, size = 'md', id, className, ref, ...rest }) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} id={id}>
      {(field) => (
        <div className="relative">
          <select ref={ref} className={controlClass({ size, error, className: `appearance-none pr-9 ${className ?? ''}` })} {...field} {...rest}>
            {placeholder !== undefined ? (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        </div>
      )}
    </FormField>
  );
}
