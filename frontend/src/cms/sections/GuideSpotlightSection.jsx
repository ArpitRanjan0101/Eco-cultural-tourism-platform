import { GuideCard } from '@/features/guides';
import CardSection from './CardSection';

/** `guide_spotlight`: verified local guides. */
export default function GuideSpotlightSection({ heading, guides, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={guides}
      columns={4}
      renderItem={(guide) => <GuideCard guide={guide} />}
      viewAll={{ href: '/guides', label: 'Meet more guides' }}
    />
  );
}
