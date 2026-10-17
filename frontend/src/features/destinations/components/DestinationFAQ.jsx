import Section from '@/components/layout/Section';
import Accordion from '@/components/ui/Accordion';

/** Destination FAQs (API order) in an accessible accordion; nothing when there are none. */
export default function DestinationFAQ({ faqs }) {
  if (!faqs?.length) return null;
  return (
    <Section id="faq" title="Frequently asked questions" containerSize="md" spacing="sm">
      <Accordion headingLevel={3} items={faqs.map((faq, index) => ({ id: `faq-${index}`, title: faq.question, content: <p className="whitespace-pre-line">{faq.answer}</p> }))} />
    </Section>
  );
}
