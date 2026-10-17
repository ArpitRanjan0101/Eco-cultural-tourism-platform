import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BaseCard from '@/components/data-display/BaseCard';
import DataTable from '@/components/data-display/DataTable';
import FilterToolbar from '@/components/data-display/FilterToolbar';
import StatCard from '@/components/data-display/StatCard';
import Alert from '@/components/feedback/Alert';
import ConfirmationDialog from '@/components/feedback/ConfirmationDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { ToastProvider, useToast } from '@/components/feedback/Toast';
import Avatar, { initials } from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import StatusBadge, { humanizeStatus } from '@/components/ui/StatusBadge';
import { expectNoAxeViolations } from '../axe';

describe('Group E — cards and badges', () => {
  it('BaseCard composes media, header, body and footer; validates variants', async () => {
    const { container } = render(
      <BaseCard media={<div>media</div>} header={<h3>Title</h3>} footer={<span>footer</span>} interactive>
        body
      </BaseCard>,
    );
    expect(screen.getByRole('article')).toHaveClass('border');
    expect(screen.getByText('footer')).toBeInTheDocument();
    expect(() => render(<BaseCard variant="glass">x</BaseCard>)).toThrow(/BaseCard variant/);
    await expectNoAxeViolations(container);
  });

  it('Badge tones and StatusBadge mapping with neutral fallback', () => {
    render(
      <>
        <Badge tone="success">Open</Badge>
        <StatusBadge status="pending_payment" tones={{ pending_payment: 'warning' }} />
        <StatusBadge status="unknown_state" />
      </>,
    );
    expect(screen.getByText('Open')).toHaveClass('text-success');
    expect(screen.getByText('Pending payment')).toHaveClass('text-warning');
    expect(screen.getByText('Unknown state')).toHaveClass('bg-surface-muted');
    expect(humanizeStatus('partially_refunded')).toBe('Partially refunded');
    expect(() => render(<Badge tone="pink">x</Badge>)).toThrow(/Badge tone/);
  });

  it('Avatar shows initials with an accessible name, or an image', () => {
    expect(initials('  ravi kumar singh ')).toBe('RK');
    render(<Avatar name="Asha Devi" />);
    expect(screen.getByRole('img', { name: 'Asha Devi' })).toHaveTextContent('AD');
    render(<Avatar name="With Photo" src="https://cdn.example.org/a.jpg" />);
    expect(screen.getByRole('img', { name: 'With Photo' })).toHaveAttribute('src', 'https://cdn.example.org/a.jpg');
  });

  it('StatCard shows a formatted value and trend', () => {
    render(<StatCard label="Bookings" value="128" change="+5%" trend="up" hint="vs last month" />);
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('+5%')).toHaveClass('text-success');
  });
});

const COLUMNS = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'city', header: 'City' },
  { key: 'count', header: 'Count', sortable: true, align: 'end', cell: (row) => <strong>{row.count}</strong> },
];
const ROWS = [
  { id: '1', name: 'Alpha', city: 'Ranchi', count: 3 },
  { id: '2', name: 'Beta', city: 'Dumka', count: 7 },
];

describe('Group E — DataTable and FilterToolbar', () => {
  it('renders a captioned, scrollable table with custom cells and aria-sort', async () => {
    function Harness() {
      const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
      return <DataTable caption="Places" columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} sort={sort} onSortChange={setSort} />;
    }
    const { container } = render(<Harness />);
    expect(screen.getByRole('table', { name: 'Places' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Places' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'City' })).not.toHaveAttribute('aria-sort');
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending');
    await userEvent.click(screen.getByRole('button', { name: /Count/ }));
    expect(screen.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByText('7').tagName).toBe('STRONG');
    await expectNoAxeViolations(container);
  });

  it('shows loading skeleton rows (aria-busy) and an empty state', () => {
    const { rerender } = render(<DataTable caption="Places" columns={COLUMNS} rows={[]} getRowKey={(row) => row.id} loading loadingRows={3} />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('row')).toHaveLength(4);
    rerender(<DataTable caption="Places" columns={COLUMNS} rows={[]} getRowKey={(row) => row.id} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('FilterToolbar is a labelled search form with submit and reset', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onReset = vi.fn();
    const { container } = render(
      <FilterToolbar label="Filter places" onSubmit={onSubmit} onReset={onReset} activeCount={2}>
        <label htmlFor="q">Search</label>
        <input id="q" name="q" />
      </FilterToolbar>,
    );
    expect(screen.getByRole('search', { name: 'Filter places' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters (2)' }));
    expect(onReset).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});

describe('Group E — feedback', () => {
  it('Alert uses alert role for danger, status otherwise, and can be dismissed', async () => {
    const onDismiss = vi.fn();
    render(
      <>
        <Alert tone="danger" title="Failed" onDismiss={onDismiss}>Try again</Alert>
        <Alert tone="success" title="Saved" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('Toast: polite for info, assertive for danger, auto-dismiss and manual dismiss', async () => {
    vi.useFakeTimers();
    function Trigger() {
      const toast = useToast();
      return (
        <>
          <button type="button" onClick={() => toast.show({ tone: 'success', title: 'Saved', duration: 1000 })}>ok</button>
          <button type="button" onClick={() => toast.show({ tone: 'danger', title: 'Failed', duration: null })}>fail</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('ok').click());
    act(() => screen.getByText('fail').click());
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    act(() => screen.getByRole('button', { name: 'Dismiss notification' }).click());
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });

  it('useToast outside the provider fails loudly', () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });

  it('Spinner announces only when labelled; Skeleton is decorative', () => {
    const { container } = render(
      <>
        <Spinner label="Loading results" />
        <Spinner />
        <Skeleton shape="text" lines={3} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading results');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('EmptyState and ErrorState render headings, reference and retry', async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <>
        <EmptyState title="No trips yet" description="Create your first trip." action={<Button>New trip</Button>} />
        <ErrorState requestId="req-42" onRetry={onRetry} headingLevel={3} />
      </>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No trips yet' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req-42');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('ConfirmationDialog focuses Cancel, confirms, and blocks dismissal while loading', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmationDialog open title="Delete?" tone="danger" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(<ConfirmationDialog open loading title="Delete?" tone="danger" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
