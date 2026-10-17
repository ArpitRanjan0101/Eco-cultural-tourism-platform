import Section from '@/components/layout/Section';
import DestinationGrid from './DestinationGrid';

/** Editor-chosen related destinations (published only, from the detail DTO). */
export default function RelatedDestinations({ related }) {
  if (!related?.length) return null;
  return (
    <Section id="related" title="You might also like">
      <DestinationGrid destinations={related} label="Related destinations" />
    </Section>
  );
}
