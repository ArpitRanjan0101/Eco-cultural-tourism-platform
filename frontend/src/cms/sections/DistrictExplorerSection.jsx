import { DistrictCard } from '@/features/geography';
import CardSection from './CardSection';

/** `district_grid`: active districts (optionally one region), each opening its district page. */
export default function DistrictExplorerSection({ heading, districts, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={districts}
      columns={4}
      tone="muted"
      renderItem={(district) => <DistrictCard district={district} />}
      viewAll={{ href: '/districts', label: 'Explore every district' }}
    />
  );
}
