'use client';

import Image from 'next/image';
import { useState } from 'react';
import BaseCard from '@/components/data-display/BaseCard';
import Carousel from '@/components/data-display/Carousel';
import DataTable from '@/components/data-display/DataTable';
import FilterToolbar from '@/components/data-display/FilterToolbar';
import ImageGallery from '@/components/data-display/ImageGallery';
import StatCard from '@/components/data-display/StatCard';
import Timeline from '@/components/data-display/Timeline';
import Alert from '@/components/feedback/Alert';
import ConfirmationDialog from '@/components/feedback/ConfirmationDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { useToast } from '@/components/feedback/Toast';
import Container from '@/components/layout/Container';
import DashboardShell from '@/components/layout/DashboardShell';
import PageHeader from '@/components/layout/PageHeader';
import Section from '@/components/layout/Section';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import Pagination from '@/components/navigation/Pagination';
import Accordion from '@/components/ui/Accordion';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button, { ButtonLink } from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import DatePicker from '@/components/ui/DatePicker';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Dialog from '@/components/ui/Dialog';
import Drawer from '@/components/ui/Drawer';
import DropdownMenu from '@/components/ui/DropdownMenu';
import IconButton from '@/components/ui/IconButton';
import { CloseIcon, InfoIcon } from '@/components/ui/icons';
import Input from '@/components/ui/Input';
import Popover from '@/components/ui/Popover';
import RadioGroup from '@/components/ui/RadioGroup';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import Switch from '@/components/ui/Switch';
import Tabs from '@/components/ui/Tabs';
import Textarea from '@/components/ui/Textarea';
import TextLink from '@/components/ui/TextLink';
import Tooltip from '@/components/ui/Tooltip';

// Sample content for the showcase only — not real tourism data (W22).
const swatch = (fill, label) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${fill}"/><text x="400" y="310" font-family="sans-serif" font-size="48" fill="#ffffff" text-anchor="middle">${label}</text></svg>`)}`;
const IMAGES = [
  { id: 'a', url: swatch('#1f5f43', 'Sample 1'), altText: 'Sample image one', width: 800, height: 600 },
  { id: 'b', url: swatch('#9a4f1e', 'Sample 2'), altText: 'Sample image two', width: 800, height: 600 },
  { id: 'c', url: swatch('#175cd3', 'Sample 3'), altText: null, width: 800, height: 600 },
];
const ROWS = [
  { id: '1', name: 'Sample row A', status: 'approved', updated: '2026-10-01' },
  { id: '2', name: 'Sample row B', status: 'pending_review', updated: '2026-10-05' },
  { id: '3', name: 'Sample row C', status: 'rejected', updated: '2026-10-09' },
];
const SAMPLE_TONES = { approved: 'success', pending_review: 'warning', rejected: 'danger' };

function Demo({ title, children }) {
  return (
    <BaseCard variant="outlined" padding="md">
      <h3 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </BaseCard>
  );
}

export default function Showcase() {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [range, setRange] = useState({ start: '2026-11-10', end: '2026-11-08' });
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [plan, setPlan] = useState('standard');

  // A <div>, not <main>: the embedded DashboardShell example provides the page's only main landmark.
  return (
    <div>
      <Container>
        <PageHeader
          eyebrow="Development only"
          title="Design system"
          description="Usage examples for every shared component. Content on this page is sample text."
          breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Design system' }]} />}
          actions={<ButtonLink href="/" variant="outline">Back to home</ButtonLink>}
        />
      </Container>

      <Section id="group-a" title="A. Tokens and layout" description="Semantic colours, type and layout wrappers.">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo title="Colour tokens">
            {['primary', 'accent', 'surface-muted', 'success', 'warning', 'danger', 'info'].map((token) => (
              <span key={token} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="size-6 rounded-sm border border-border" style={{ background: `var(--color-${token})` }} />
                {token}
              </span>
            ))}
          </Demo>
          <Demo title="Typography">
            <div className="flex flex-col gap-1">
              <p className="font-display text-3xl font-semibold">Display heading</p>
              <p className="text-base">Body text in the sans family.</p>
              <p className="text-sm text-muted">Muted supporting text.</p>
            </div>
          </Demo>
        </div>
      </Section>

      <Section id="group-b" title="B. Actions" tone="muted">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo title="Button variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </Demo>
          <Demo title="Sizes and states">
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <IconButton icon={<CloseIcon />} label="Close example" variant="outline" />
          </Demo>
          <Demo title="Links">
            <TextLink href="/">Inline link</TextLink>
            <TextLink href="/" variant="standalone">Standalone link</TextLink>
            <TextLink href="/" variant="subtle">Subtle link</TextLink>
            <TextLink href="https://example.org" external>External link</TextLink>
          </Demo>
        </div>
      </Section>

      <Section id="group-c" title="C. Forms">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
          <Input label="Full name" hint="As on your identity document." required />
          <Input label="Email" type="email" error="Enter a valid email address." defaultValue="not-an-email" />
          <Select label="Region" placeholder="Choose a region" options={[{ value: 'north', label: 'Sample region North' }, { value: 'south', label: 'Sample region South' }]} />
          <Input label="Disabled field" disabled defaultValue="Read only" />
          <Textarea label="Message" hint="Up to 500 characters." />
          <div className="flex flex-col gap-4">
            <Checkbox label="I agree to the sample terms" hint="Required to continue." />
            <Switch label="Email notifications" description="Receive updates by email." defaultChecked />
            <RadioGroup legend="Plan" name="plan" value={plan} onChange={setPlan} orientation="horizontal" options={[{ value: 'standard', label: 'Standard' }, { value: 'premium', label: 'Premium' }]} />
          </div>
          <DatePicker label="Single date" min="2026-01-01" />
          <DateRangePicker legend="Date range (shows order validation)" value={range} onChange={setRange} startLabel="From" endLabel="To" />
        </form>
      </Section>

      <Section id="group-d" title="D. Navigation and overlays" tone="muted">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo title="Tabs">
            <Tabs
              label="Example tabs"
              className="w-full"
              tabs={[
                { id: 'overview', label: 'Overview', content: <p>Overview panel.</p> },
                { id: 'details', label: 'Details', content: <p>Details panel.</p> },
                { id: 'locked', label: 'Locked', content: <p>Never shown.</p>, disabled: true },
                { id: 'reviews', label: 'Reviews', content: <p>Reviews panel.</p> },
              ]}
            />
          </Demo>
          <Demo title="Pagination">
            <Pagination page={4} pageSize={20} total={190} hrefFor={(page) => `/design-system?page=${page}`} />
          </Demo>
          <Demo title="Dialog, drawer, confirmation">
            <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="outline" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete item</Button>
          </Demo>
          <Demo title="Menu, popover, tooltip">
            <DropdownMenu
              label="Actions"
              items={[
                { id: 'edit', label: 'Edit', onSelect: () => toast.show({ title: 'Edit selected' }) },
                { id: 'duplicate', label: 'Duplicate', disabled: true },
                { id: 'archive', label: 'Archive', tone: 'danger', onSelect: () => toast.show({ tone: 'warning', title: 'Archive selected' }) },
              ]}
            />
            <Popover label="Filters" title="Example filters">
              <Checkbox label="Only available" />
            </Popover>
            <Tooltip content="More information about this field">
              <IconButton icon={<InfoIcon />} label="Help" variant="outline" />
            </Tooltip>
          </Demo>
        </div>
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Example dialog" description="Focus stays inside until it closes." footer={<Button onClick={() => setDialogOpen(false)}>Done</Button>}>
          <Input label="Field inside dialog" />
        </Dialog>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Example drawer">
          <p>Drawer content.</p>
        </Drawer>
        <ConfirmationDialog
          open={confirmOpen}
          title="Delete this item?"
          description="This cannot be undone."
          tone="danger"
          confirmLabel="Delete"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            toast.show({ tone: 'success', title: 'Item deleted (example)' });
          }}
        />
      </Section>

      <Section id="group-e" title="E. Data and feedback">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Sample metric" value="1,284" change="+12%" trend="up" hint="vs last period" />
            <StatCard label="Another metric" value="38" change="−4%" trend="down" />
            <BaseCard variant="elevated" header={<h3 className="font-sans font-semibold">Base card</h3>}>
              <div className="flex items-center gap-3">
                <Avatar name="Sample Person" />
                <Badge tone="primary">Badge</Badge>
                <StatusBadge status="pending_review" tones={SAMPLE_TONES} />
              </div>
            </BaseCard>
          </div>
          <FilterToolbar label="Example filters" onSubmit={(event) => event.preventDefault()} onReset={() => {}} activeCount={1}>
            <Input label="Search" size="md" />
            <Select label="Status" placeholder="Any status" options={Object.keys(SAMPLE_TONES).map((value) => ({ value, label: value }))} />
          </FilterToolbar>
          <DataTable
            caption="Example records"
            columns={[
              { key: 'name', header: 'Name', sortable: true },
              { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} tones={SAMPLE_TONES} /> },
              { key: 'updated', header: 'Updated', sortable: true, align: 'end' },
            ]}
            rows={ROWS}
            getRowKey={(row) => row.id}
            sort={sort}
            onSortChange={setSort}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Alert tone="info" title="Information">Neutral information.</Alert>
            <Alert tone="success" title="Saved">Your changes were saved.</Alert>
            <Alert tone="warning" title="Check details">Some details need attention.</Alert>
            <Alert tone="danger" title="Could not save">Please try again.</Alert>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => toast.show({ tone: 'success', title: 'Toast example', description: 'Disappears after 5 seconds.' })}>
              Show toast
            </Button>
            <Spinner label="Loading example" />
            <div className="w-48">
              <Skeleton shape="text" lines={3} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState headingLevel={3} title="No results" description="Try removing a filter." action={<Button variant="outline">Clear filters</Button>} />
            <ErrorState headingLevel={3} requestId="req_example_123" onRetry={() => {}} />
          </div>
        </div>
      </Section>

      <Section id="group-f" title="F. Rich components" tone="muted">
        <div className="grid gap-4 lg:grid-cols-2">
          <Accordion
            headingLevel={3}
            items={[
              { id: 'one', title: 'First question', content: 'First answer.' },
              { id: 'two', title: 'Second question', content: 'Second answer.' },
            ]}
          />
          <Timeline
            items={[
              { id: '1', time: '1 Oct 2026', dateTime: '2026-10-01', title: 'Created', tone: 'primary' },
              { id: '2', time: '2 Oct 2026', dateTime: '2026-10-02', title: 'Reviewed', description: 'Example step.', tone: 'success' },
            ]}
          />
          <ImageGallery images={IMAGES} title="Example gallery" />
          <Carousel
            label="Example carousel"
            items={IMAGES}
            getItemKey={(image) => image.id}
            renderItem={(image) => (
              <div className="relative aspect-[4/3] w-full">
                <Image src={image.url} alt={image.altText ?? 'Sample slide'} fill unoptimized className="object-cover" />
              </div>
            )}
          />
        </div>
        <div className="mt-6 h-96 overflow-hidden rounded-lg border border-border">
          <DashboardShell
            title="Example area"
            navLabel="Example navigation"
            currentPath="/design-system/overview"
            navItems={[
              { href: '/design-system/overview', label: 'Overview' },
              { href: '/design-system/settings', label: 'Settings' },
            ]}
          >
            <p>Dashboard content area.</p>
          </DashboardShell>
        </div>
      </Section>
    </div>
  );
}
