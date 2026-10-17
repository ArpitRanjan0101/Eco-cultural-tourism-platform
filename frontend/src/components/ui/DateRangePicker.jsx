'use client';

import { useId } from 'react';
import { FieldError, FieldHint, RequiredMark } from '@/components/forms/FormField';
import { cx } from '@/lib/cx';
import { controlClass } from './Input';

/** Returns an error message when the range is invalid, else null. Dates are `YYYY-MM-DD` strings. */
export function validateDateRange({ start, end }, { allowSameDay = true } = {}) {
  if (!start || !end) return null;
  if (end < start) return 'The end date must be on or after the start date.';
  if (!allowSameDay && end === start) return 'The end date must be after the start date.';
  return null;
}

/**
 * Start/end date pair with built-in order validation. Controlled: `value` + `onChange({ start, end })`.
 * The end input's minimum follows the chosen start date. Generic: no stay or booking rules here.
 * @param {{ legend: string, value: { start?: string, end?: string }, onChange: (range) => void,
 *   startLabel?: string, endLabel?: string, min?: string, max?: string, allowSameDay?: boolean,
 *   required?: boolean, hint?: string, error?: string, startName?: string, endName?: string, className?: string }} props
 * `error` (e.g. from the server) is shown in addition to the built-in order check.
 */
export default function DateRangePicker({
  legend,
  value,
  onChange,
  startLabel = 'Start date',
  endLabel = 'End date',
  min,
  max,
  allowSameDay = true,
  required = false,
  hint,
  error,
  startName,
  endName,
  className,
}) {
  const id = useId();
  const rangeError = validateDateRange(value, { allowSameDay });
  const shownError = rangeError ?? error;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = shownError ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const update = (patch) => onChange({ start: value.start ?? '', end: value.end ?? '', ...patch });

  return (
    <fieldset className={cx('flex flex-col gap-2', className)}>
      <legend className="mb-1 text-sm font-medium text-text">
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>
      <FieldHint id={hintId}>{hint}</FieldHint>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-start`} className="text-sm text-text">
            {startLabel}
          </label>
          <input
            id={`${id}-start`}
            type="date"
            name={startName}
            value={value.start ?? ''}
            min={min}
            max={max}
            required={required || undefined}
            aria-describedby={describedBy}
            aria-invalid={error && !rangeError ? true : undefined}
            onChange={(event) => update({ start: event.target.value })}
            className={controlClass({ error: error && !rangeError })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-end`} className="text-sm text-text">
            {endLabel}
          </label>
          <input
            id={`${id}-end`}
            type="date"
            name={endName}
            value={value.end ?? ''}
            min={value.start || min}
            max={max}
            required={required || undefined}
            aria-describedby={describedBy}
            aria-invalid={shownError ? true : undefined}
            onChange={(event) => update({ end: event.target.value })}
            className={controlClass({ error: shownError })}
          />
        </div>
      </div>
      <FieldError id={errorId}>{shownError}</FieldError>
    </fieldset>
  );
}
