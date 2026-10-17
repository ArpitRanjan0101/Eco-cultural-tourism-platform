import SectionRenderer, { firstSectionIsHero } from '@/cms/SectionRenderer';

/**
 * The CMS-composed homepage: every section comes from GET /content/homepage, in the order editors set.
 * A leading hero carries the h1; otherwise a visually hidden h1 names the page.
 * @param {{ page: { title: string, sections: Array<object> }, siteName: string }} props
 */
export default function HomePage({ page, siteName }) {
  return (
    <>
      {firstSectionIsHero(page.sections) ? null : <h1 className="sr-only">{siteName}</h1>}
      <SectionRenderer sections={page.sections} promoteFirstHero />
    </>
  );
}
