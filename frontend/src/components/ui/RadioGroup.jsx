'use client';

import { useId } from 'react';
import { FieldError, FieldHint, RequiredMark } from '@/components/forms/FormField';
import { cx } from '@/lib/cx';

/**
 * Single-choice group of native radios inside a fieldset (arrow keys move selection natively).
 * @param {{ legend: string, name: string, options: Array<{ value: string, label: string, hint?: string,
 *   disabled?: boolean }>, value?: string, defaultValue?: string, onChange?: (value: string) => void,
 *   hint?: string, error?: string, required?: boolean, orientation?: 'vertical'|'horizontal', className?: string }} props
 */
export default function RadioGroup({ legend, name, options, value, defaultValue, onChange, hint, error, required = false, orientation = 'vertical', className }) {
  const baseId = useId();
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const controlled = value !== undefined;
  return (
    <fieldset className={cx('flex flex-col gap-2', className)} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
      <legend className="mb-1 text-sm font-medium text-text">
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <div className={cx('flex gap-3', orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col')}>
        {options.map((option, index) => {
          const optionId = `${baseId}-${index}`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <input
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                disabled={option.disabled}
                required={required || undefined}
                {...(controlled ? { checked: value === option.value } : { defaultChecked: defaultValue === option.value })}
                onChange={(event) => onChange?.(event.target.value)}
                className="mt-0.5 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
              />
              <label htmlFor={optionId} className="text-sm text-text">
                {option.label}
                {option.hint ? <span className="block text-muted">{option.hint}</span> : null}
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
