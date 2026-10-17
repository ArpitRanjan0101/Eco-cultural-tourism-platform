import Button from '@/components/ui/Button';
import { AlertIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * Failed load or action. Shows the backend `requestId` (or a Next error digest) so support can trace it (P4).
 * @param {{ title?: string, description?: string, requestId?: string, onRetry?: () => void,
 *   retryLabel?: string, headingLevel?: 2|3, className?: string }} props
 */
export default function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If the problem continues, contact support with the reference below.',
  requestId,
  onRetry,
  retryLabel = 'Try again',
  headingLevel = 2,
  className,
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-6 py-10 text-center', className)}>
      <AlertIcon className="size-8 text-danger" />
      <Heading className="font-sans text-lg font-semibold text-text">{title}</Heading>
      <p className="max-w-md text-sm text-text">{description}</p>
      {requestId ? (
        <p className="text-xs text-muted">
          Reference: <code className="font-mono">{requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
