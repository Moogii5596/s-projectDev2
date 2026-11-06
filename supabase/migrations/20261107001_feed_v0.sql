-- ============================================================
-- v0.2.3 Блок 5 — Feed v0 (FEED-01, G-9) + санал хүсэлтийн зураг (FB-SYS-01a) (2026-11-07)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок 5
--
-- Хэрэглэгчийн шийдвэр (2026-11-07 01:20–01:23):
--   - Харагдах хүрээ: байгууллага (tenant) даяар. Пост / лайк / сэтгэгдэл / report — идэвхтэй бүх хэрэглэгч (app код).
--   - Модерац: `feed.content.moderate` (OWNER / ADMIN автоматаар) — бусдын пост, сэтгэгдэл устгах, report шийдвэрлэх.
--   - Report: нэг хүн нэг зүйлийг нэг удаа; N (tenants.settings.feed.autoHideReports, анхдагч 3) өөр хүн
--     мэдээлбэл модератор шийдэх хүртэл түр нуугдана (hidden_at).
--   - Засвар: пост (зөвхөн текст) болон сэтгэгдэл засагдана; өмнөх текст feed_revisions-д — бүх уншигч харна.
--   - Зураг: пост бүрт ≤6; хувилбар бүр (480/1080/2048 WebP) storage-д, key-д агуулгын hash (immutable cache);
--     thumbhash — placeholder. Санал хүсэлтэд ≤3 дэлгэцийн зураг (core_feedback_attachments).
--
-- Rollback:
--   DROP TABLE feed_reports, feed_revisions, feed_reactions, feed_comments, feed_post_media, feed_posts,
--              core_feedback_attachments;
--   DROP TYPE "FeedReactionKind", "FeedReportReason", "FeedReportStatus";
--   DROP FUNCTION feed_auto_hide_threshold();
--   DELETE FROM core_permissions WHERE code = 'feed.content.moderate'; (+ ck_core_permissions_code-ийг camp|hr|core болгох)
-- ============================================================

CREATE TYPE "FeedReactionKind" AS ENUM ('LIKE');
CREATE TYPE "FeedReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'PRIVACY', 'OTHER');
CREATE TYPE "FeedReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'REMOVED');

-- ── 1. Пост ──────────────────────────────────────────────────
CREATE TABLE feed_posts (
  id             UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id      UUID        NOT NULL,                       -- core_users.id (R13)
  body           TEXT        NOT NULL DEFAULT '',            -- зурагтай бол хоосон байж болно (app код шалгана)
  media_count    SMALLINT    NOT NULL DEFAULT 0,
  like_count     INTEGER     NOT NULL DEFAULT 0,             -- тоолуурууд — app код нэг tx-д шинэчилнэ
  comment_count  INTEGER     NOT NULL DEFAULT 0,
  report_count   INTEGER     NOT NULL DEFAULT 0,             -- OPEN report-ын тоо
  edited_at      TIMESTAMPTZ,
  hidden_at      TIMESTAMPTZ,                                -- report-оор автоматаар нуусан
  deleted_at     TIMESTAMPTZ,                                -- soft delete (зохиогч эсвэл модератор)
  deleted_by     UUID,                                       -- core_users.id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_feed_posts_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_feed_posts_author FOREIGN KEY (tenant_id, author_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_posts_deleted_by FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (deleted_by),
  CONSTRAINT ck_feed_posts_body CHECK (length(body) <= 5000),
  CONSTRAINT ck_feed_posts_counts CHECK (media_count BETWEEN 0 AND 6 AND like_count >= 0
                                         AND comment_count >= 0 AND report_count >= 0)
);
-- Жагсаалт (cursor = created_at, id): зөвхөн устгаагүй
CREATE INDEX idx_feed_posts_list ON feed_posts (tenant_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_feed_posts_author ON feed_posts (tenant_id, author_id);
SELECT camp_apply_tenant_rls('feed_posts');

-- ── 2. Зураг ─────────────────────────────────────────────────
-- variants: [{ "w": 480, "h": 360, "key": "<tenant>/feed/<hash>-480.webp", "bytes": 21000, "fmt": "webp", "hash": "…" }, …]
-- (өргөнөөр өсөх; формат талбартай — дараа AVIF нэмэхэд схем өөрчлөгдөхгүй)
CREATE TABLE feed_post_media (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id      UUID        NOT NULL,
  sort_order   SMALLINT    NOT NULL,
  width        INTEGER     NOT NULL,
  height       INTEGER     NOT NULL,
  thumbhash    TEXT        NOT NULL,
  variants     JSONB       NOT NULL,
  total_bytes  INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_feed_post_media_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT uq_feed_post_media_order UNIQUE (post_id, sort_order),
  CONSTRAINT fk_feed_post_media_post FOREIGN KEY (tenant_id, post_id)
    REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_feed_post_media_order CHECK (sort_order BETWEEN 0 AND 5),
  CONSTRAINT ck_feed_post_media_size CHECK (width > 0 AND height > 0 AND total_bytes >= 0),
  CONSTRAINT ck_feed_post_media_variants CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) >= 1)
);
SELECT camp_apply_tenant_rls('feed_post_media');

-- ── 3. Сэтгэгдэл ─────────────────────────────────────────────
CREATE TABLE feed_comments (
  id            UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id       UUID        NOT NULL,
  author_id     UUID        NOT NULL,                        -- core_users.id
  body          TEXT        NOT NULL,
  report_count  INTEGER     NOT NULL DEFAULT 0,
  edited_at     TIMESTAMPTZ,
  hidden_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_feed_comments_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_feed_comments_post FOREIGN KEY (tenant_id, post_id)
    REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_comments_author FOREIGN KEY (tenant_id, author_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_comments_deleted_by FOREIGN KEY (tenant_id, deleted_by)
    REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (deleted_by),
  CONSTRAINT ck_feed_comments_body CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  CONSTRAINT ck_feed_comments_reports CHECK (report_count >= 0)
);
CREATE INDEX idx_feed_comments_post ON feed_comments (tenant_id, post_id, created_at, id) WHERE deleted_at IS NULL;
SELECT camp_apply_tenant_rls('feed_comments');

-- ── 4. Лайк ──────────────────────────────────────────────────
CREATE TABLE feed_reactions (
  id          UUID               NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID               NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id     UUID               NOT NULL,
  user_id     UUID               NOT NULL,                   -- core_users.id
  kind        "FeedReactionKind" NOT NULL DEFAULT 'LIKE',
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_feed_reactions UNIQUE (post_id, user_id, kind),
  CONSTRAINT fk_feed_reactions_post FOREIGN KEY (tenant_id, post_id)
    REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_reactions_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_feed_reactions_user ON feed_reactions (tenant_id, user_id);
SELECT camp_apply_tenant_rls('feed_reactions');

-- ── 5. Засварын түүх (пост эсвэл сэтгэгдэл — яг нэг нь) ──────
-- Мөр бүр = засахаас ӨМНӨХ текст; created_at = солигдсон мөч.
CREATE TABLE feed_revisions (
  id          UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id     UUID,
  comment_id  UUID,
  body        TEXT        NOT NULL,
  edited_by   UUID        NOT NULL,                          -- core_users.id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_feed_revisions_post FOREIGN KEY (tenant_id, post_id)
    REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_revisions_comment FOREIGN KEY (tenant_id, comment_id)
    REFERENCES feed_comments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_revisions_editor FOREIGN KEY (tenant_id, edited_by)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_feed_revisions_target CHECK (num_nonnulls(post_id, comment_id) = 1)
);
CREATE INDEX idx_feed_revisions_post ON feed_revisions (tenant_id, post_id, created_at) WHERE post_id IS NOT NULL;
CREATE INDEX idx_feed_revisions_comment ON feed_revisions (tenant_id, comment_id, created_at) WHERE comment_id IS NOT NULL;
SELECT camp_apply_tenant_rls('feed_revisions');

-- ── 6. Report ────────────────────────────────────────────────
CREATE TABLE feed_reports (
  id           UUID               NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID               NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id      UUID,
  comment_id   UUID,
  reporter_id  UUID               NOT NULL,                  -- core_users.id
  reason       "FeedReportReason" NOT NULL,
  note         TEXT,
  status       "FeedReportStatus" NOT NULL DEFAULT 'OPEN',
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ        NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_feed_reports_post FOREIGN KEY (tenant_id, post_id)
    REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_reports_comment FOREIGN KEY (tenant_id, comment_id)
    REFERENCES feed_comments (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_reports_reporter FOREIGN KEY (tenant_id, reporter_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_reports_resolved_by FOREIGN KEY (tenant_id, resolved_by)
    REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (resolved_by),
  CONSTRAINT ck_feed_reports_target CHECK (num_nonnulls(post_id, comment_id) = 1),
  CONSTRAINT ck_feed_reports_note CHECK (note IS NULL OR length(note) <= 500)
);
-- Нэг хүн нэг зүйлийг нэг удаа (сэтгэгдэлд post_id NULL — тусдаа partial unique)
CREATE UNIQUE INDEX uq_feed_reports_post ON feed_reports (post_id, reporter_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX uq_feed_reports_comment ON feed_reports (comment_id, reporter_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_feed_reports_open ON feed_reports (tenant_id, status, created_at DESC);
SELECT camp_apply_tenant_rls('feed_reports');

-- ── 7. Санал хүсэлтийн дэлгэцийн зураг (Блок F-ийн үлдэгдэл, ≤3) ──
CREATE TABLE core_feedback_attachments (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feedback_id  UUID        NOT NULL,
  sort_order   SMALLINT    NOT NULL,
  width        INTEGER     NOT NULL,
  height       INTEGER     NOT NULL,
  thumbhash    TEXT        NOT NULL,
  variants     JSONB       NOT NULL,
  total_bytes  INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_core_feedback_attachments_order UNIQUE (feedback_id, sort_order),
  CONSTRAINT fk_core_feedback_attachments_feedback FOREIGN KEY (tenant_id, feedback_id)
    REFERENCES core_feedback (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_core_feedback_attachments_order CHECK (sort_order BETWEEN 0 AND 2),
  CONSTRAINT ck_core_feedback_attachments_size CHECK (width > 0 AND height > 0 AND total_bytes >= 0),
  CONSTRAINT ck_core_feedback_attachments_variants CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) >= 1)
);
SELECT camp_apply_tenant_rls('core_feedback_attachments');

-- ── 8. Эрх: feed.content.moderate (ADR-007 каталог) ──────────
-- OWNER / ADMIN — isTenantAdmin-аар автоматаар; бусдад роль / шууд эрхээр олгоно. Системийн рольд анхдагчаар олгохгүй.
-- Кодын модуль `feed` нэмэгдэв (20261106005-ийн CHECK: camp|hr|core).
ALTER TABLE core_permissions DROP CONSTRAINT ck_core_permissions_code;
ALTER TABLE core_permissions ADD CONSTRAINT ck_core_permissions_code CHECK (code ~ '^(camp|hr|core|feed)\.[a-z_]+\.[a-z_]+$');
INSERT INTO core_permissions (code, name, sort_order, module, available_in) VALUES
  ('feed.content.moderate', 'Feed модерац (пост, сэтгэгдэл устгах, report)', 200, 'feed', 'v1');

-- ── 9. Report-оор автоматаар нуух босго (tenants.settings.feed.autoHideReports, анхдагч 3) ──
-- App хэрэглэгч tenants-ыг шууд уншихгүй — зөвхөн одоогийн tenant-ийн (app.tenant_id) тоог буцаана.
CREATE OR REPLACE FUNCTION feed_auto_hide_threshold()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT GREATEST(1, COALESCE(
    (SELECT CASE WHEN (t.settings #>> '{feed,autoHideReports}') ~ '^[0-9]{1,4}$'
                 THEN (t.settings #>> '{feed,autoHideReports}')::int END
       FROM tenants t
      WHERE t.id = NULLIF(current_setting('app.tenant_id', true), '')::uuid),
    3));
$$;
