'use client';

import FormField from '@/components/forms/FormField';
import { fieldVariants } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

/**
 * Labelled multi-line input.
 * @param {{ label: string, hint?: string, error?: string, required?: boolean, rows?: number, id?: string,
 *   className?: string, ref?: React.Ref }} props
 */
export default function Textarea({ label, hint, error, required, hideLabel, rows = 4, id, className, ref, ...rest }) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} id={id}>
      {(field) => (
        <textarea
          ref={ref}
          rows={rows}
          className={cx(fieldVariants.control, 'py-2 text-sm', error ? fieldVariants.state.invalid : fieldVariants.state.default, className)}
          {...field}
          {...rest}
        />
      )}
    </FormField>
  );
}
