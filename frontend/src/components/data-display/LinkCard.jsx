import Link from 'next/link';
import BaseCard from './BaseCard';

/**
 * Card whose title link covers the whole card (one tab stop, accessible name = the title).
 * @param {{ href: string, title: string, headingLevel?: 2|3|4, media?: React.ReactNode, eyebrow?: React.ReactNode,
 *   footer?: React.ReactNode, children?: React.ReactNode, className?: string }} props
 */
export default function LinkCard({ href, title, headingLevel = 3, media, eyebrow, footer, children, className }) {
  const Heading = `h${headingLevel}`;
  return (
    <BaseCard variant="outlined" padding="md" media={media} interactive className={`w-full ${className ?? ''}`}>
      {eyebrow ? <div className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</div> : null}
      <Heading className="font-display text-lg font-semibold leading-snug">
        <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus hover:text-primary">
          {title}
        </Link>
      </Heading>
      {children ? <div className="flex flex-1 flex-col gap-2 text-sm text-muted">{children}</div> : null}
      {footer ? <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">{footer}</div> : null}
    </BaseCard>
  );
}
