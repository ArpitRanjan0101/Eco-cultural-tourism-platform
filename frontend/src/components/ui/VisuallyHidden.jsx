/**
 * Content for assistive technology only (screen readers), hidden visually.
 * @param {{ as?: string, children: React.ReactNode }} props
 */
export default function VisuallyHidden({ as: Tag = 'span', children, ...rest }) {
  return (
    <Tag className="sr-only" {...rest}>
      {children}
    </Tag>
  );
}
