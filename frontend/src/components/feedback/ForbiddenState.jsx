import { ButtonLink } from '@/components/ui/Button';
import { AlertIcon } from '@/components/ui/icons';
import { cx } from '@/lib/cx';

/**
 * Shown when a signed-in user opens an area their permissions do not cover (W13).
 * @param {{ title?: string, description?: string, homeHref?: string, homeLabel?: string, className?: string }} props
 */
export default function ForbiddenState({
  title = 'You do not have access to this page',
  description = 'Your account does not have the permissions this area needs. If you think it should, contact an administrator.',
  homeHref = '/',
  homeLabel = 'Go to the homepage',
  className,
}) {
  return (
    <div className={cx('mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-border bg-surface-raised px-6 py-12 text-center', className)}>
      <AlertIcon className="size-8 text-warning" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{description}</p>
      <ButtonLink href={homeHref} variant="outline" className="mt-2">
        {homeLabel}
      </ButtonLink>
    </div>
  );
}
