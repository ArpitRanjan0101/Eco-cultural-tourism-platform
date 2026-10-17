import { SECTION_REGISTRY } from './sectionRegistry';

function skip(reason, section, extra) {
  console.warn(JSON.stringify({ level: 'warn', msg: 'cms.section_skipped', reason, sectionId: section?.id, type: section?.type, ...extra }));
  return null;
}

/**
 * Renders published CMS sections through the approved registry (W15). Unknown types and sections whose data
 * fails its schema are skipped and logged — never rendered raw. Server Component (no client JS of its own).
 * @param {{ sections: Array<{ id: string, type: string, data: object }>, promoteFirstHero?: boolean }} props
 *   `promoteFirstHero`: a hero in first position carries the page's h1 (homepage).
 */
export default function SectionRenderer({ sections, promoteFirstHero = false }) {
  return sections.map((section, index) => {
    const entry = Object.hasOwn(SECTION_REGISTRY, section.type) ? SECTION_REGISTRY[section.type] : null;
    if (!entry) return skip('unknown-type', section);
    const parsed = entry.schema.safeParse(section.data);
    if (!parsed.success) return skip('invalid-data', section, { issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')) });
    const { Component } = entry;
    return (
      <Component key={section.id} {...parsed.data} sectionId={`section-${section.id}`} headingLevel={promoteFirstHero && index === 0 && section.type === 'hero' ? 1 : 2} />
    );
  });
}

/** True when the first section will render the page's h1. */
export function firstSectionIsHero(sections) {
  return sections[0]?.type === 'hero' && SECTION_REGISTRY.hero.schema.safeParse(sections[0].data).success;
}
