import PlainText from './PlainText';

/**
 * Description block (plain API text: paragraphs kept, no markup interpreted) under its own h2. Renders nothing
 * when there is neither text nor extra content.
 * @param {{ title: string, text?: string|null, children?: React.ReactNode }} props `children` follow the text.
 */
export default function AboutSection({ title, text, children }) {
  if (!text?.trim() && !children) return null;
  return (
    <section aria-labelledby="about-heading" className="flex flex-col gap-3">
      <h2 id="about-heading" className="text-2xl font-semibold">
        {title}
      </h2>
      <PlainText text={text} />
      {children}
    </section>
  );
}
