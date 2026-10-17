'use client';

import { useId, useState } from 'react';
import { cx } from '@/lib/cx';

/**
 * On/off setting (ARIA switch). Controlled (`checked` + `onChange(checked)`) or uncontrolled (`defaultChecked`).
 * With `name`, a hidden input submits "true"/"false" in native forms.
 * @param {{ label: string, description?: string, checked?: boolean, defaultChecked?: boolean,
 *   onChange?: (checked: boolean) => void, disabled?: boolean, name?: string, className?: string }} props
 */
export default function Switch({ label, description, checked, defaultChecked = false, onChange, disabled = false, name, className }) {
  const id = useId();
  const [internal, setInternal] = useState(defaultChecked);
  const isOn = checked ?? internal;
  const toggle = () => {
    if (checked === undefined) setInternal(!isOn);
    onChange?.(!isOn);
  };
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col">
        <span id={`${id}-label`} className="text-sm font-medium text-text">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="text-sm text-muted">
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={toggle}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-[var(--duration-fast)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60',
          isOn ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span aria-hidden="true" className={cx('inline-block size-5 rounded-full bg-surface-raised shadow-sm transition-transform duration-[var(--duration-fast)]', isOn ? 'translate-x-5' : 'translate-x-0')} />
      </button>
      {name ? <input type="hidden" name={name} value={String(isOn)} /> : null}
    </div>
  );
}
