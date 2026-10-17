'use client';

import { FieldError, FieldHint, useFieldA11y } from '@/components/forms/FormField';
import { cx } from '@/lib/cx';

/**
 * Native checkbox with label, hint and error. Controlled (`checked` + `onChange`) or uncontrolled
 * (`defaultChecked`); works with React Hook Form `register`.
 * @param {{ label: React.ReactNode, hint?: string, error?: string, id?: string, disabled?: boolean,
 *   className?: string, ref?: React.Ref }} props
 */
export default function Checkbox({ label, hint, error, id, className, ref, ...rest }) {
  const { controlId, hintId, errorId, controlProps } = useFieldA11y({ id, hint, error });
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary disabled:cursor-not-allowed"
          {...controlProps}
          {...rest}
        />
        <label htmlFor={controlId} className="text-sm text-text">
          {label}
        </label>
      </div>
      <div className="pl-6">
        <FieldHint id={hintId}>{hint}</FieldHint>
        <FieldError id={errorId}>{error}</FieldError>
      </div>
    </div>
  );
}
