-- Report 4.12 (rest): CMS pages, sections, menus, redirects and announcements.

CREATE TABLE cms_pages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  slug             TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  page_type        TEXT NOT NULL CHECK (page_type IN ('homepage', 'landing', 'static')),
  seo_title        TEXT CHECK (char_length(seo_title) <= 200),
  seo_description  TEXT CHECK (char_length(seo_description) <= 320),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Exactly one homepage document exists (it may be draft or published).
CREATE UNIQUE INDEX cms_pages_single_homepage ON cms_pages (page_type) WHERE page_type = 'homepage';
CREATE INDEX cms_pages_status_idx ON cms_pages (status);
CREATE TRIGGER cms_pages_set_updated_at BEFORE UPDATE ON cms_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- section_data is validated against the allowlisted section registry (cms.sections.js) before writing.
CREATE TABLE cms_page_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES cms_pages (id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL CHECK (section_type IN (
                  'hero', 'rich_text', 'featured_destinations', 'category_grid',
                  'district_grid', 'image_gallery', 'cta_banner', 'faq')),
  section_data  JSONB NOT NULL CHECK (jsonb_typeof(section_data) = 'object'),
  sort_order    INTEGER NOT NULL CHECK (sort_order >= 0),
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, sort_order)
);
CREATE INDEX cms_page_sections_data_gin ON cms_page_sections USING GIN (section_data jsonb_path_ops);
CREATE TRIGGER cms_page_sections_set_updated_at BEFORE UPDATE ON cms_page_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cms_menus (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{1,49}$'),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER cms_menus_set_updated_at BEFORE UPDATE ON cms_menus FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cms_menu_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id     UUID NOT NULL REFERENCES cms_menus (id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES cms_menu_items (id) ON DELETE CASCADE,
  label       TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
  link_type   TEXT NOT NULL CHECK (link_type IN ('internal', 'external', 'page', 'destination', 'district', 'category')),
  link_value  TEXT NOT NULL CHECK (char_length(link_value) BETWEEN 1 AND 500),
  sort_order  INTEGER NOT NULL CHECK (sort_order >= 0),
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id),
  UNIQUE NULLS NOT DISTINCT (menu_id, parent_id, sort_order)
);
CREATE INDEX cms_menu_items_menu_idx ON cms_menu_items (menu_id);
CREATE TRIGGER cms_menu_items_set_updated_at BEFORE UPDATE ON cms_menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cms_redirects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path  TEXT NOT NULL UNIQUE CHECK (source_path ~ '^/[A-Za-z0-9._~/%-]*$' AND char_length(source_path) <= 500),
  target_path  TEXT NOT NULL CHECK ((target_path ~ '^/[A-Za-z0-9._~/%?=&-]*$' OR target_path ~ '^https://') AND char_length(target_path) <= 1000),
  status_code  SMALLINT NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_path <> target_path)
);
CREATE TRIGGER cms_redirects_set_updated_at BEFORE UPDATE ON cms_redirects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cms_announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  message     TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  link        TEXT CHECK (link ~ '^(/|https://)' AND char_length(link) <= 1000),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX cms_announcements_active_idx ON cms_announcements (status, starts_at, ends_at);
CREATE TRIGGER cms_announcements_set_updated_at BEFORE UPDATE ON cms_announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
