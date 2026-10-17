import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import Pagination, { pageWindow } from '@/components/navigation/Pagination';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Drawer from '@/components/ui/Drawer';
import DropdownMenu from '@/components/ui/DropdownMenu';
import Popover from '@/components/ui/Popover';
import Tabs from '@/components/ui/Tabs';
import Tooltip from '@/components/ui/Tooltip';
import { expectNoAxeViolations } from '../axe';

const TABS = [
  { id: 'a', label: 'Alpha', content: 'Alpha panel' },
  { id: 'b', label: 'Beta', content: 'Beta panel', disabled: true },
  { id: 'c', label: 'Gamma', content: 'Gamma panel' },
];

describe('Group D — Tabs', () => {
  it('roving focus: arrows skip disabled tabs and wrap; Home/End jump; panels follow', async () => {
    const onChange = vi.fn();
    const { container } = render(<Tabs label="Sections" tabs={TABS} onChange={onChange} />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tabpanel', { name: 'Alpha' })).toHaveTextContent('Alpha panel');

    alpha.focus();
    await userEvent.keyboard('{ArrowRight}');
    const gamma = screen.getByRole('tab', { name: 'Gamma' });
    expect(gamma).toHaveFocus();
    expect(gamma).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Gamma' })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    expect(alpha).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(gamma).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(alpha).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('a');
    await expectNoAxeViolations(container);
  });
});

describe('Group D — Breadcrumbs and Pagination', () => {
  it('Breadcrumbs marks the last item as the current page', async () => {
    const { container } = render(<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Destinations', href: '/destinations' }, { label: 'Netarhat' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Netarhat')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Destinations' })).toHaveAttribute('href', '/destinations');
    await expectNoAxeViolations(container);
  });

  it('pageWindow shows first, last, neighbours and gaps', () => {
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('Pagination links pages, marks the current one and disables the edge', async () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={95} hrefFor={(p) => `/list?page=${p}`} />);
    expect(screen.getByText('Showing 1–20 of 95')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Page 5' })).toHaveAttribute('href', '/list?page=5');
    expect(screen.getByText('Previous').closest('[aria-disabled]')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/list?page=2');
    await expectNoAxeViolations(container);
  });

  it('Pagination renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={7} hrefFor={() => '/'} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function DialogHarness({ Component = Dialog, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Component open={open} onClose={() => setOpen(false)} title="Edit details" description="Change and save" footer={<Button>Save</Button>} {...props}>
        <label htmlFor="inside">Inside</label>
        <input id="inside" />
      </Component>
    </>
  );
}

describe('Group D — Dialog and Drawer', () => {
  it('opens as a labelled modal and closes on Escape (cancel), restoring focus', async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription('Change and save');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(opener).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes from the close button and from a backdrop click, not from content clicks', async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(screen.getByLabelText('Inside'));
    expect(dialog).toHaveAttribute('open');
    fireEvent.click(dialog);
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });

  it('Tab and Shift+Tab wrap inside the dialog', async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it('Drawer shares the modal behaviour and has no axe violations when open', async () => {
    const { container } = render(<DialogHarness Component={Drawer} side="left" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Edit details' })).toHaveClass('mr-auto');
    await expectNoAxeViolations(container);
  });
});

describe('Group D — DropdownMenu, Popover, Tooltip', () => {
  it('DropdownMenu follows the menu-button keyboard model', async () => {
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    render(
      <DropdownMenu
        label="Actions"
        items={[
          { id: 'edit', label: 'Edit', onSelect: onEdit },
          { id: 'copy', label: 'Copy', disabled: true },
          { id: 'archive', label: 'Archive', onSelect: onArchive },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(onArchive).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('DropdownMenu ignores disabled items and closes on outside press', async () => {
    render(
      <div>
        <p>Outside</p>
        <DropdownMenu label="More" items={[{ id: 'x', label: 'Locked', disabled: true, onSelect: vi.fn() }, { id: 'y', label: 'Open' }]} />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const locked = screen.getByRole('menuitem', { name: 'Locked' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Popover moves focus into a named panel and Escape returns it', async () => {
    render(
      <Popover label="Filters" title="Filter options">
        <p>Panel</p>
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Filters' });
    await userEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Filter options' });
    expect(panel).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Tooltip describes its trigger on focus and hides on Escape and blur', async () => {
    render(
      <Tooltip content="Opens the help page">
        <button type="button">Help</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Help' });
    expect(button).toHaveAccessibleDescription('Opens the help page');
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
    await userEvent.tab();
    expect(screen.getByRole('tooltip')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
    await userEvent.hover(button);
    expect(screen.getByRole('tooltip')).toBeVisible();
    await userEvent.unhover(button);
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });
});
