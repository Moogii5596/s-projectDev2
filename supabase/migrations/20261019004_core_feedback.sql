-- ============================================================
-- v0.2.3 Блок F — Санал хүсэлт / хөгжүүлэлтийн захиалга (FB-SYS-01a) (2026-10-19)
-- ============================================================
-- Tech plan: 09_v0.2.3_tech_plan.md Блок F
--
-- Хэрэглэгчийн шийдвэр (2026-10-19 15:41):
--   - Нэвтэрсэн бүх хэрэглэгч санал илгээнэ, БҮГДИЙН саналыг харна, «+1» дарна (core_feedback_votes)
--   - Төлөв, хариу, хэрэгжсэн хувилбар — зөвхөн OWNER / ADMIN (app код)
--   - Зураг хавсралт — v0.2.3 Feed-ийн StorageService-тэй хамт (энд баганагүй)
-- Төлөв: NEW → ACCEPTED → PLANNED → DONE (+ REJECTED аль ч шатнаас; буцааж нээж болно)
--
-- Rollback: DROP TABLE core_feedback_votes; DROP TABLE core_feedback;
--           DROP TYPE "CoreFeedbackKind"; DROP TYPE "CoreFeedbackStatus";
-- ============================================================

CREATE TYPE "CoreFeedbackKind" AS ENUM ('BUG', 'IDEA', 'REQUEST');
CREATE TYPE "CoreFeedbackStatus" AS ENUM ('NEW', 'ACCEPTED', 'PLANNED', 'DONE', 'REJECTED');

CREATE TABLE core_feedback (
  id            UUID                 NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id     UUID                 NOT NULL,              -- core_users.id (RULE-13)
  kind          "CoreFeedbackKind"   NOT NULL,
  title         TEXT                 NOT NULL,
  body          TEXT                 NOT NULL DEFAULT '',
  page_path     TEXT,                                       -- илгээсэн хуудас (автомат)
  app_version   TEXT,                                       -- илгээх үеийн хувилбар (backend APP_VERSION)
  status        "CoreFeedbackStatus" NOT NULL DEFAULT 'NEW',
  admin_reply   TEXT,
  replied_by    UUID,                                       -- core_users.id
  replied_at    TIMESTAMPTZ,
  done_version  TEXT,                                       -- DONE үед: аль хувилбарт хэрэгжсэн (Шинэчлэлийн түүхтэй холбоно)
  vote_count    INTEGER              NOT NULL DEFAULT 0,    -- core_feedback_votes-ийн тоо (app код нэг tx-д шинэчилнэ)
  created_at    TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ          NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_core_feedback_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_core_feedback_author FOREIGN KEY (tenant_id, author_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_core_feedback_replied_by FOREIGN KEY (tenant_id, replied_by)
    REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (replied_by),
  CONSTRAINT ck_core_feedback_title CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT ck_core_feedback_body CHECK (length(body) <= 5000),
  CONSTRAINT ck_core_feedback_reply CHECK (admin_reply IS NULL OR length(admin_reply) <= 5000),
  CONSTRAINT ck_core_feedback_votes CHECK (vote_count >= 0),
  CONSTRAINT ck_core_feedback_done_version CHECK (done_version IS NULL OR done_version ~ '^v?[0-9]+(\.[0-9]+){1,3}$')
);
CREATE INDEX idx_core_feedback_list ON core_feedback (tenant_id, status, created_at DESC);
CREATE INDEX idx_core_feedback_author ON core_feedback (tenant_id, author_id);
CREATE INDEX idx_core_feedback_done ON core_feedback (tenant_id, done_version) WHERE status = 'DONE';

SELECT camp_apply_tenant_rls('core_feedback');

CREATE TABLE core_feedback_votes (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feedback_id  UUID        NOT NULL,
  user_id      UUID        NOT NULL,                        -- core_users.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_core_feedback_votes UNIQUE (feedback_id, user_id),
  CONSTRAINT fk_core_feedback_votes_feedback FOREIGN KEY (tenant_id, feedback_id)
    REFERENCES core_feedback (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_core_feedback_votes_user FOREIGN KEY (tenant_id, user_id)
    REFERENCES core_users (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_core_feedback_votes_user ON core_feedback_votes (tenant_id, user_id);

SELECT camp_apply_tenant_rls('core_feedback_votes');
