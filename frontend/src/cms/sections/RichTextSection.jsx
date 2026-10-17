import Section from '@/components/layout/Section';
import Markdown from '../Markdown';

/** `rich_text`: restricted Markdown rendered safely (no HTML, safe links only). */
export default function RichTextSection({ heading, markdown, sectionId }) {
  return (
    <Section id={sectionId} title={heading ?? undefined} containerSize="md">
      <Markdown>{markdown}</Markdown>
    </Section>
  );
}
