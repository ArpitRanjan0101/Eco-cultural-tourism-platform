import { cx } from '@/lib/cx';

/**
 * Plain text from the API as paragraphs: blank lines split paragraphs, single line breaks are kept, and no markup
 * is ever interpreted (React escapes it).
 * @param {{ text?: string|null, className?: string }} props
 */
export default function PlainText({ text, className }) {
  const paragraphs = (text ?? '').split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return null;
  return (
    <div className={cx('flex max-w-prose flex-col gap-3 text-base leading-relaxed', className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
