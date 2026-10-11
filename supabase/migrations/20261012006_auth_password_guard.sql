-- ============================================================
-- v0.2.1 PIL-07 (SEC-007) — Нэвтрэлтийн хамгаалалт: бүртгэл тус бүрт буруу нууц үгийн хязгаар
--   Supabase Auth-ийн `password_verification_attempt` hook (pg-functions). Caddy/Funnel-ийн ард GoTrue-ийн
--   IP хязгаар ажиллахгүй (GOTRUE_RATE_LIMIT_HEADER-ийг Supabase CLI тохируулдаггүй) тул бүртгэлээр хязгаарлана.
--   Дүрэм: 15 минутад 5 буруу оролдлого → 15 минут түгжинэ (зөв нууц үгтэй ч 429). Зөв нэвтэрвэл тоолуур тэглэнэ.
--   Идэвхжүүлэх: deploy/{pilot,staging}/supabase/config.toml [auth.hook.password_verification_attempt].
--   Түгжээг гараар тайлах: DELETE FROM auth_guard.password_failures WHERE user_id = '<auth.users.id>';
--   Тусдаа schema: public-ийн нөөц/сэргээлт, PostgREST, app_user-д хамаарахгүй (түр төлөв).
-- ============================================================
CREATE SCHEMA IF NOT EXISTS auth_guard;
REVOKE ALL ON SCHEMA auth_guard FROM PUBLIC;

CREATE TABLE auth_guard.password_failures (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  failed_count  INTEGER     NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ
);
REVOKE ALL ON auth_guard.password_failures FROM PUBLIC;

CREATE OR REPLACE FUNCTION auth_guard.hook_password_verification_attempt(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  max_failures CONSTANT INTEGER  := 5;
  fail_window  CONSTANT INTERVAL := INTERVAL '15 minutes';
  lock_for     CONSTANT INTERVAL := INTERVAL '15 minutes';
  uid   UUID := (event ->> 'user_id')::UUID;
  r     auth_guard.password_failures%ROWTYPE;
  mins  INTEGER;
BEGIN
  SELECT * INTO r FROM auth_guard.password_failures WHERE user_id = uid FOR UPDATE;

  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.locked_until - now())) / 60)::INTEGER);
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 429,
      'message', format('Хэт олон буруу оролдлого — %s минутын дараа дахин оролдоно уу. / Too many failed attempts — try again in %s min. / 尝试次数过多，请 %s 分钟后再试。', mins, mins, mins)
    ));
  END IF;

  IF (event ->> 'valid')::BOOLEAN THEN
    DELETE FROM auth_guard.password_failures WHERE user_id = uid;
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  INSERT INTO auth_guard.password_failures AS f (user_id, failed_count, window_start, locked_until)
  VALUES (uid, 1, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    failed_count = CASE WHEN f.window_start < now() - fail_window OR f.locked_until IS NOT NULL THEN 1 ELSE f.failed_count + 1 END,
    window_start = CASE WHEN f.window_start < now() - fail_window OR f.locked_until IS NOT NULL THEN now() ELSE f.window_start END,
    locked_until = NULL
  RETURNING * INTO r;

  IF r.failed_count >= max_failures THEN
    UPDATE auth_guard.password_failures SET locked_until = now() + lock_for WHERE user_id = uid;
  END IF;
  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

REVOKE EXECUTE ON FUNCTION auth_guard.hook_password_verification_attempt(JSONB) FROM PUBLIC;
DO $$
BEGIN
  -- Supabase-д supabase_auth_admin (GoTrue) байдаг; энгийн PostgreSQL-д (зарим тест) байхгүй байж болно
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA auth_guard TO supabase_auth_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_guard.password_failures TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION auth_guard.hook_password_verification_attempt(JSONB) TO supabase_auth_admin;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA auth_guard FROM anon, authenticated;
    REVOKE ALL ON auth_guard.password_failures FROM anon, authenticated;
    REVOKE EXECUTE ON FUNCTION auth_guard.hook_password_verification_attempt(JSONB) FROM anon, authenticated;
  END IF;
END $$;
