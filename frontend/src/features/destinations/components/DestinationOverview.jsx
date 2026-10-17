/**
 * Destination description (plain text from the API; paragraphs and line breaks kept, no markup interpreted).
 * @param {{ description?: string|null }} props
 */
export default function DestinationOverview({ description }) {
  if (!description) return null;
  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
      <h2 id="overview-heading" className="text-2xl font-semibold">
        About this place
      </h2>
      <div className="flex max-w-prose flex-col gap-3 text-base leading-relaxed">
        {description
          .split(/\n{2,}/)
          .filter((paragraph) => paragraph.trim())
          .map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph.trim()}
            </p>
          ))}
      </div>
    </section>
  );
}
