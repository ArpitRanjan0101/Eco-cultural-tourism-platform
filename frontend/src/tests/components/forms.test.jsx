import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FormField from '@/components/forms/FormField';
import Checkbox from '@/components/ui/Checkbox';
import DatePicker from '@/components/ui/DatePicker';
import DateRangePicker, { validateDateRange } from '@/components/ui/DateRangePicker';
import Input from '@/components/ui/Input';
import RadioGroup from '@/components/ui/RadioGroup';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Textarea from '@/components/ui/Textarea';
import { expectNoAxeViolations } from '../axe';

describe('Group C — FormField and text controls', () => {
  it('FormField wires label, hint, error and required onto the control', () => {
    render(
      <FormField label="Name" hint="Your full name" error="Required" required>
        {(field) => <input {...field} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Your full name Required');
  });

  it('Input: label association, error state, disabled, typing, forwarded ref', async () => {
    const ref = { current: null };
    render(<Input label="Email" type="email" error="Invalid email" ref={ref} />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveClass('border-danger');
    expect(input).toHaveAccessibleDescription('Invalid email');
    await userEvent.type(input, 'a@b.in');
    expect(ref.current.value).toBe('a@b.in');
    render(<Input label="Locked" disabled />);
    expect(screen.getByRole('textbox', { name: 'Locked' })).toBeDisabled();
  });

  it('Textarea is a labelled multiline control', () => {
    render(<Textarea label="Message" rows={6} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('rows', '6');
  });

  it('Select: placeholder, options, disabled option, selection', async () => {
    const onChange = vi.fn();
    render(<Select label="Region" placeholder="Choose" required onChange={onChange} options={[{ value: 'n', label: 'North' }, { value: 's', label: 'South', disabled: true }]} />);
    const select = screen.getByRole('combobox', { name: 'Region' });
    expect(screen.getByRole('option', { name: 'Choose' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'South' })).toBeDisabled();
    await userEvent.selectOptions(select, 'n');
    expect(select).toHaveValue('n');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Group C — choice controls', () => {
  it('Checkbox works uncontrolled and controlled', async () => {
    render(<Checkbox label="Agree" hint="Needed" />);
    const box = screen.getByRole('checkbox', { name: 'Agree' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription('Needed');

    function Controlled() {
      const [checked, setChecked] = useState(true);
      return <Checkbox label="Controlled" checked={checked} onChange={(event) => setChecked(event.target.checked)} />;
    }
    render(<Controlled />);
    const controlled = screen.getByRole('checkbox', { name: 'Controlled' });
    await userEvent.click(controlled);
    expect(controlled).not.toBeChecked();
  });

  it('RadioGroup: fieldset legend, single choice, arrow-key selection, error', async () => {
    const onChange = vi.fn();
    render(<RadioGroup legend="Plan" name="plan" defaultValue="a" onChange={onChange} error="Pick one" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    const group = screen.getByRole('group', { name: 'Plan' });
    expect(group).toHaveAccessibleDescription('Pick one');
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
  });

  it('Switch toggles with click and keyboard, controlled and uncontrolled, submits via hidden input', async () => {
    const onChange = vi.fn();
    const { container } = render(<Switch label="Alerts" description="Email me" name="alerts" onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Alerts' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    expect(container.querySelector('input[type=hidden]')).toHaveValue('false');

    render(<Switch label="Fixed" checked={false} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Fixed' }));
    expect(screen.getByRole('switch', { name: 'Fixed' })).toHaveAttribute('aria-checked', 'false');
  });

  it('Switch disabled does not toggle', async () => {
    render(<Switch label="Off" disabled />);
    await userEvent.click(screen.getByRole('switch', { name: 'Off' }));
    expect(screen.getByRole('switch', { name: 'Off' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Group C — dates', () => {
  it('DatePicker is a labelled native date input with YYYY-MM-DD values', () => {
    render(<DatePicker label="Visit date" defaultValue="2026-12-01" min="2026-11-01" />);
    const input = screen.getByLabelText('Visit date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-12-01');
    expect(input).toHaveAttribute('min', '2026-11-01');
  });

  it('validateDateRange enforces order and optional same-day rule', () => {
    expect(validateDateRange({ start: '2026-11-10', end: '2026-11-09' })).toMatch(/on or after/);
    expect(validateDateRange({ start: '2026-11-10', end: '2026-11-10' })).toBeNull();
    expect(validateDateRange({ start: '2026-11-10', end: '2026-11-10' }, { allowSameDay: false })).toMatch(/after the start/);
    expect(validateDateRange({ start: '2026-11-10', end: '' })).toBeNull();
  });

  it('DateRangePicker shows the order error, binds end.min to start and emits both values', async () => {
    function Harness() {
      const [range, setRange] = useState({ start: '2026-11-10', end: '2026-11-08' });
      return <DateRangePicker legend="Dates" value={range} onChange={setRange} />;
    }
    const { container } = render(<Harness />);
    const end = screen.getByLabelText('End date');
    expect(end).toHaveAttribute('min', '2026-11-10');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument();
    await userEvent.clear(end);
    await userEvent.type(end, '2026-11-12');
    expect(end).toHaveValue('2026-11-12');
    expect(screen.queryByText(/must be on or after/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('DateRangePicker shows an external error when the order is valid', () => {
    render(<DateRangePicker legend="Dates" value={{ start: '2026-11-10', end: '2026-11-12' }} onChange={() => {}} error="Not available" />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
  });
});

describe('Group C — accessibility', () => {
  it('a full form of controls has no axe violations', async () => {
    const { container } = render(
      <form>
        <Input label="Name" required hint="Full name" />
        <Input label="Email" error="Invalid" />
        <Textarea label="Notes" />
        <Select label="Region" options={[{ value: 'a', label: 'A' }]} />
        <Checkbox label="Agree" />
        <RadioGroup legend="Plan" name="p" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />
        <Switch label="Alerts" />
        <DatePicker label="Date" />
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});
