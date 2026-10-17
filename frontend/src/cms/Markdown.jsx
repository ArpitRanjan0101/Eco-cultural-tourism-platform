import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { ExternalIcon } from '@/components/ui/icons';
import VisuallyHidden from '@/components/ui/VisuallyHidden';
import { isExternalHref, isSafeHref } from './links';

// Restricted Markdown for CMS text (WO3 resolved: react-markdown). Raw HTML is never interpreted (skipHtml, no
// rehype-raw); only these elements render; images are not allowed in text (media goes through media ids);
// links must pass the same allowlist as the backend. Output is React elements only — no dangerouslySetInnerHTML.
const ALLOWED = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'a', 'blockquote', 'br', 'hr', 'code'];

function SafeLink({ href, children }) {
  if (!isSafeHref(href)) return <span>{children}</span>;
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
        {children}{' '}
        <ExternalIcon className="inline size-3.5" />
        <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
      </a>
    );
  }
  return (
    <Link href={href} className="font-medium text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}

// Section headings are h2; Markdown headings sit below them.
const subHeading = (Tag) =>
  function MarkdownHeading({ children }) {
    return <Tag className="mt-6 font-display text-xl font-semibold first:mt-0">{children}</Tag>;
  };

const COMPONENTS = {
  a: ({ href, children }) => <SafeLink href={href}>{children}</SafeLink>,
  h1: subHeading('h3'),
  h2: subHeading('h3'),
  h3: subHeading('h4'),
  h4: subHeading('h4'),
  h5: subHeading('h4'),
  h6: subHeading('h4'),
  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-accent pl-4 italic text-muted">{children}</blockquote>,
  code: ({ children }) => <code className="rounded-sm bg-surface-muted px-1 font-mono text-sm">{children}</code>,
};

/** Keeps safe link targets, drops everything else (javascript:, data:, protocol-relative…). */
export function safeUrlTransform(url) {
  return isSafeHref(url) ? url : null;
}

/**
 * Renders CMS Markdown safely.
 * @param {{ children: string, className?: string }} props
 */
export default function Markdown({ children, className }) {
  return (
    <div className={className ?? 'flex max-w-prose flex-col gap-4 text-base leading-relaxed text-text'}>
      <ReactMarkdown skipHtml allowedElements={ALLOWED} unwrapDisallowed urlTransform={safeUrlTransform} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
