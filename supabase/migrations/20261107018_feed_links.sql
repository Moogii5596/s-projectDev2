-- ============================================================
-- v0.2.4 Блок 10б (FEED-04) — пост ↔ объектын ерөнхий холбоос
--   FEED-03: пост → засварын хүсэлт (CAMP_MAINTENANCE), FEED-05: пост → санал хүсэлт (CORE_FEEDBACK).
--   Дараагийн (хоолны гомдол, өрөө солих) төрлүүд энэ хүснэгтийг ашиглана — давхар код ✖.
--   Нэг пост — төрөл бүрт нэг объект; нэг объект — нэг пост. Төлөвийг уншихдаа объектоос (хуулбар хадгалахгүй).
-- ============================================================
CREATE TABLE feed_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL,
  object_type TEXT NOT NULL CHECK (object_type ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  object_id   UUID NOT NULL,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_feed_links_post FOREIGN KEY (tenant_id, post_id) REFERENCES feed_posts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_links_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id),
  CONSTRAINT uq_feed_links_post_type UNIQUE (tenant_id, post_id, object_type),
  CONSTRAINT uq_feed_links_object UNIQUE (tenant_id, object_type, object_id)
);
SELECT camp_apply_tenant_rls('feed_links');
