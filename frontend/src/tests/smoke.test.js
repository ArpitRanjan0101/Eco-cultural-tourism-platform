import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/app/error';
import RootLayout, { metadata } from '@/app/layout';
import Loading from '@/components/feedback/PageLoading';
import NotFound from '@/app/not-found';
import HomePage from '@/app/page';
import { site } from '@/config/site';

describe('app shell smoke', () => {
  it('renders the root page with the site name as the only h1', () => {
    render(createElement(HomePage));
    expect(screen.getByRole('heading', { level: 1, name: site.name })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('root layout declares the document language and wraps children', () => {
    const tree = RootLayout({ children: createElement('p', null, 'child') });
    expect(tree.type).toBe('html');
    expect(tree.props.lang).toBe('en');
    expect(metadata.title.default).toBe(site.name);
  });

  it('page loading fallback announces a status to assistive technology', () => {
    render(createElement(Loading));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('not-found page links back home', () => {
    render(createElement(NotFound));
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/');
  });

  it('error boundary shows the digest, hides the message and retries', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('db password leaked in stack'), { digest: 'abc123' });
    render(createElement(ErrorBoundary, { error, reset }));
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: abc123');
    expect(screen.queryByText(/db password/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
