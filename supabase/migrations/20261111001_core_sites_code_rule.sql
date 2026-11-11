-- v0.2.4.2: core_sites.code-ийн дүрмийг кемпийн кодтой нийцүүлэх.
-- 20261107050 нь '^[A-Z][A-Z0-9_-]{0,39}$' байсан тул тоогоор эхэлсэн кемпийн код (Sino «01») backfill-д унасан.
-- 20261107050-ийг засварласан; аль хэдийн хэрэгжүүлсэн DB-д (dev/CI) энэ migration дүрмийг шинэчилнэ.
ALTER TABLE core_sites DROP CONSTRAINT IF EXISTS core_sites_code_check;
ALTER TABLE core_sites ADD CONSTRAINT core_sites_code_check CHECK (code ~ '^[A-Za-z0-9._-]{1,40}$');
