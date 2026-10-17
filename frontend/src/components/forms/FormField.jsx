'use client';

import { useId } from 'react';
import { AlertIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/** Builds the ids and ARIA attributes shared by every labelled control. */
export function useFieldA11y({ id, hint, error }) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return {
    controlId,
    hintId,
    errorId,
    controlProps: {
      id: controlId,
      'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      'aria-invalid': error ? true : undefined,
    },
  };
}

export function FieldHint({ id, children }) {
  return children ? (
    <p id={id} className="text-sm text-muted">
      {children}
    </p>
  ) : null;
}

export function FieldError({ id, children }) {
  return children ? (
    <p id={id} className="flex items-start gap-1 text-sm font-medium text-danger">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  ) : null;
}

export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-danger">
      *
    </span>
  );
}

/**
 * Label + control + hint + error composition (W11). `children` is a render function receiving the props to
 * spread on the control: `{ id, 'aria-describedby', 'aria-invalid', required }`.
 * @param {{ label: string, hint?: string, error?: string, required?: boolean, id?: string, hideLabel?: boolean,
 *   className?: string, children: (props: object) => React.ReactNode }} props
 */
export default function FormField({ label, hint, error, required = false, id, hideLabel = false, className, children }) {
  const { controlId, hintId, errorId, controlProps } = useFieldA11y({ id, hint, error });
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className={cx('text-sm font-medium text-text', hideLabel && 'sr-only')}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      <FieldHint id={hintId}>{hint}</FieldHint>
      {children({ ...controlProps, required: required || undefined })}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
