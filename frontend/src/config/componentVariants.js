// Documented variants for shared components (W20, COMPONENT_CATALOG.md). Components read their classes from
// here; feature code never re-declares control styling.

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export const buttonVariants = {
  base: `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`,
  variant: {
    primary: 'bg-primary text-on-primary hover:bg-primary-hover',
    secondary: 'bg-accent text-on-accent hover:bg-accent-hover',
    outline: 'border border-border-strong bg-surface-raised text-text hover:bg-surface-muted',
    ghost: 'text-text hover:bg-surface-muted',
    danger: 'bg-danger text-on-primary hover:bg-danger-hover',
  },
  size: {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  },
  iconSize: {
    sm: 'size-8',
    md: 'size-10',
    lg: 'size-12',
  },
};

export const linkVariants = {
  base: `rounded-sm ${FOCUS}`,
  variant: {
    inline: 'font-medium text-primary underline underline-offset-4 hover:text-primary-hover',
    standalone: 'inline-flex items-center gap-1 font-medium text-primary hover:underline hover:underline-offset-4',
    subtle: 'text-muted hover:text-text hover:underline hover:underline-offset-4',
  },
};

export const fieldVariants = {
  control: `block w-full rounded-md border bg-surface-raised px-3 text-text placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted ${FOCUS}`,
  state: {
    default: 'border-border-strong',
    invalid: 'border-danger',
  },
  size: {
    sm: 'h-8 text-sm',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  },
};

export const toneVariants = {
  badge: {
    neutral: 'bg-surface-muted text-text',
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  },
  alert: {
    info: 'border-info/30 bg-info-soft text-info',
    success: 'border-success/30 bg-success-soft text-success',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    danger: 'border-danger/30 bg-danger-soft text-danger',
  },
};

export const cardVariants = {
  variant: {
    plain: 'bg-surface-raised',
    elevated: 'bg-surface-raised shadow-md',
    outlined: 'border border-border bg-surface-raised',
  },
  padding: {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7',
  },
};

export const layoutVariants = {
  container: {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-none',
  },
  sectionSpacing: {
    none: '',
    sm: 'py-6',
    md: 'py-10 md:py-14',
    lg: 'py-14 md:py-20',
  },
  sectionTone: {
    default: '',
    muted: 'bg-surface-muted',
    raised: 'bg-surface-raised',
    primary: 'bg-primary text-on-primary',
  },
};

/**
 * Returns the class for `value` from a variant map. Unknown values throw outside production (variant
 * validation, W20) and fall back to `fallback` in production so a bad prop never breaks a page.
 */
export function pickVariant(map, value, fallback, label) {
  if (Object.hasOwn(map, value)) return map[value];
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`${label}: unknown value "${value}". Allowed: ${Object.keys(map).join(', ')}`);
  }
  return map[fallback];
}
