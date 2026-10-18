import AboutSection from '@/components/data-display/AboutSection';

/**
 * Destination description (plain text from the API; paragraphs and line breaks kept, no markup interpreted).
 * @param {{ description?: string|null }} props
 */
export default function DestinationOverview({ description }) {
  return <AboutSection title="About this place" text={description} />;
}
