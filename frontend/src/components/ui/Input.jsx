'use client';

import FormField from '@/components/forms/FormField';
import { fieldVariants, pickVariant } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/** Shared class builder for text-like controls. */
export function controlClass({ size = 'md', error, className }) {
  return cx(
    fieldVariants.control,
    pickVariant(fieldVariants.size, size, 'md', 'Field size'),
    error ? fieldVariants.state.invalid : fieldVariants.state.default,
    className,
  );
}

/**
 * Labelled text input. Works controlled, uncontrolled and with React Hook Form `register` (ref is forwarded).
 * @param {{ label: string, hint?: string, error?: string, required?: boolean, hideLabel?: boolean,
 *   size?: 'sm'|'md'|'lg', type?: string, id?: string, className?: string, ref?: React.Ref }} props
 */
export default function Input({ label, hint, error, required, hideLabel, size = 'md', type = 'text', id, className, ref, ...rest }) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} id={id}>
      {(field) => <input ref={ref} type={type} className={controlClass({ size, error, className })} {...field} {...rest} />}
    </FormField>
  );
}
