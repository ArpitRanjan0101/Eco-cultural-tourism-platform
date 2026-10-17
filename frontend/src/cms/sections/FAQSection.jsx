import Section from '@/components/layout/Section';
import Accordion from '@/components/ui/Accordion';

/** `faq`: plain-text questions and answers in an accessible accordion. */
export default function FAQSection({ heading, items, sectionId }) {
  return (
    <Section id={sectionId} title={heading ?? 'Frequently asked questions'} containerSize="md">
      <Accordion headingLevel={3} items={items.map((item, index) => ({ id: `q${index}`, title: item.question, content: <p className="whitespace-pre-line">{item.answer}</p> }))} />
    </Section>
  );
}
