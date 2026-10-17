import { ExperienceCard } from '@/features/experiences';
import CardSection from './CardSection';

/** `experience_grid`: published cultural and nature experiences. */
export default function ExperienceGridSection({ heading, experiences, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={experiences}
      tone="muted"
      renderItem={(experience) => <ExperienceCard experience={experience} />}
      viewAll={{ href: '/experiences', label: 'See all experiences' }}
    />
  );
}
