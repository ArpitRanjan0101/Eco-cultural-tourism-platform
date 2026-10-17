'use client';

import Input from './Input';

/**
 * Single calendar date (native date input: keyboard, screen-reader and mobile pickers from the platform).
 * Values are `YYYY-MM-DD` strings with no time-zone conversion (W12). Generic: business rules such as stay
 * lengths belong to the feature using it.
 * @param {{ label: string, value?: string, defaultValue?: string, onChange?: (event) => void, min?: string,
 *   max?: string, hint?: string, error?: string, required?: boolean, id?: string, ref?: React.Ref }} props
 */
export default function DatePicker(props) {
  return <Input type="date" {...props} />;
}
