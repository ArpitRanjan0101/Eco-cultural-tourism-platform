-- Rolling back removes sections of the eight newer types (the original constraint cannot hold them).
DELETE FROM cms_page_sections WHERE section_type IN (
  'home_search', 'featured_stays', 'experience_grid', 'guide_spotlight',
  'package_showcase', 'image_text', 'statistics_strip', 'cultural_highlights');
ALTER TABLE cms_page_sections DROP CONSTRAINT cms_page_sections_section_type_check;
ALTER TABLE cms_page_sections ADD CONSTRAINT cms_page_sections_section_type_check CHECK (section_type IN (
  'hero', 'rich_text', 'featured_destinations', 'category_grid',
  'district_grid', 'image_gallery', 'cta_banner', 'faq'));
