import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Section from '@/components/layout/Section';
import Button, { ButtonLink } from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import { CloseIcon } from '@/components/ui/icons';
import TextLink from '@/components/ui/TextLink';
import VisuallyHidden from '@/components/ui/VisuallyHidden';
import { expectNoAxeViolations } from '../axe';

describe('Group A — layout', () => {
  it('Container applies the size variant and rejects unknown sizes', () => {
    const { container } = render(<Container size="sm">x</Container>);
    expect(container.firstChild).toHaveClass('max-w-2xl', 'mx-auto');
    expect(() => render(<Container size="huge">x</Container>)).toThrow(/Container size/);
  });

  it('Section is labelled by its heading and supports tones', () => {
    render(
      <Section id="intro" title="Introduction" description="About" tone="muted" headingLevel={3}>
        body
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Introduction' });
    expect(region).toHaveClass('bg-surface-muted');
    expect(screen.getByRole('heading', { level: 3, name: 'Introduction' })).toBeInTheDocument();
  });

  it('PageHeader renders one h1 with eyebrow, description and actions', async () => {
    const { container } = render(<PageHeader title="Explore" eyebrow="Discover" description="Places" actions={<Button>Act</Button>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Discover')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('VisuallyHidden keeps text accessible', () => {
    render(<button type="button"><VisuallyHidden>Hidden name</VisuallyHidden></button>);
    expect(screen.getByRole('button', { name: 'Hidden name' })).toBeInTheDocument();
  });
});

describe('Group B — actions', () => {
  it('Button defaults to type=button and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('loading keeps the label, disables and marks busy', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'outline', 'ghost', 'danger'])('renders variant %s', (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    expect(screen.getByRole('button', { name: variant })).toBeEnabled();
  });

  it('rejects unknown variants and sizes', () => {
    expect(() => render(<Button variant="fancy">x</Button>)).toThrow(/Button variant/);
    expect(() => render(<Button size="xl">x</Button>)).toThrow(/Button size/);
  });

  it('ButtonLink renders a link with button styling', () => {
    render(<ButtonLink href="/explore">Explore</ButtonLink>);
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore');
  });

  it('IconButton requires and exposes its label', () => {
    render(<IconButton icon={<CloseIcon />} label="Close panel" />);
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
    expect(() => render(<IconButton icon={<CloseIcon />} />)).toThrow(/label/);
  });

  it('TextLink: internal link, external opens safely and announces the new tab', async () => {
    const { container } = render(
      <p>
        <TextLink href="/about">About</TextLink> <TextLink href="https://example.org" external>Partner site</TextLink>
      </p>,
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    const external = screen.getByRole('link', { name: /Partner site/ });
    expect(external).toHaveAccessibleName('Partner site (opens in a new tab)');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    await expectNoAxeViolations(container);
  });
});
