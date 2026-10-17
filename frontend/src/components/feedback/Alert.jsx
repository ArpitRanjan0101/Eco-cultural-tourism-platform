import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from '@/components/ui/icons';
import { pickVariant, toneVariants } from '@/config/componentVariants';
import { cx } from '@/lib/cx';

const ICONS = { info: InfoIcon, success: CheckIcon, warning: AlertIcon, danger: AlertIcon };

/**
 * Inline message. `danger` is announced assertively (role="alert"), other tones politely (role="status").
 * @param {{ tone?: 'info'|'success'|'warning'|'danger', title?: string, children?: React.ReactNode,
 *   action?: React.ReactNode, onDismiss?: () => void, dismissLabel?: string, className?: string }} props
 */
export default function Alert({ tone = 'info', title, children, action, onDismiss, dismissLabel = 'Dismiss', className }) {
  const Icon = ICONS[tone] ?? InfoIcon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-4', pickVariant(toneVariants.alert, tone, 'info', 'Alert tone'), className)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title && 'mt-1', 'text-text')}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="-m-1 h-fit rounded-sm p-1 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-focus">
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
