CREATE TABLE core_sequences (
  id             UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_type  TEXT        NOT NULL CHECK (sequence_type ~ '^[a-z][a-z0-9_.-]*$'),
  scope_key      TEXT        NOT NULL DEFAULT '',
  prefix         TEXT        NOT NULL,
  sequence_year  INTEGER     NOT NULL CHECK (sequence_year BETWEEN 1 AND 9999),
  digits         SMALLINT    NOT NULL CHECK (digits BETWEEN 1 AND 12),
  current_value  INTEGER     NOT NULL CHECK (current_value > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_sequences_scope UNIQUE (tenant_id, sequence_type, scope_key, prefix, sequence_year)
);

CREATE INDEX idx_core_sequences_type ON core_sequences (tenant_id, sequence_type);
SELECT camp_apply_tenant_rls('core_sequences');

CREATE TABLE core_scheduled_jobs (
  job_key          TEXT        NOT NULL PRIMARY KEY CHECK (job_key ~ '^[a-z][a-z0-9-]*$'),
  module_id        TEXT        NOT NULL,
  cron_expression  TEXT        NOT NULL,
  lock_token       UUID,
  lease_until      TIMESTAMPTZ,
  last_started_at  TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_status      TEXT CHECK (last_status IS NULL OR last_status IN ('SUCCEEDED', 'FAILED')),
  last_result      JSONB,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_core_scheduled_jobs_lock CHECK ((lock_token IS NULL) = (lease_until IS NULL))
);

REVOKE ALL ON core_scheduled_jobs FROM app_user;

WITH numbered AS (
  SELECT tenant_id,
         regexp_match(mr_number, '^MR-([0-9]{4})-([0-9]+)$') AS parts,
         substring(mr_number FROM '^MR-[0-9]{4}-([0-9]+)$')::INTEGER AS current_value
  FROM mr_headers
  WHERE mr_number ~ '^MR-[0-9]{4}-[0-9]+$'
)
INSERT INTO core_sequences (tenant_id, sequence_type, scope_key, prefix, sequence_year, digits, current_value)
SELECT tenant_id,
       'material_requisition.number',
       '',
       'MR-' || parts[1] || '-',
       (parts[1])::INTEGER,
       4,
       max(current_value)
FROM numbered
GROUP BY tenant_id, parts[1];

WITH numbered AS (
  SELECT r.tenant_id,
         r.camp_id,
         parsed.parts,
         left(r.request_no, length(r.request_no) - length(parsed.parts[1]) - length(parsed.parts[2]) - 2)
           || '-' || parsed.parts[1] || '-' AS prefix,
  substring(r.request_no FROM '-[0-9]{4}-([0-9]+)$')::INTEGER AS current_value
  FROM camp_maintenance_requests r
  JOIN camps c ON c.tenant_id = r.tenant_id AND c.id = r.camp_id
  CROSS JOIN LATERAL regexp_match(r.request_no, '-([0-9]{4})-([0-9]+)$') AS parsed(parts)
  WHERE r.request_no ~ '^ZAS-.*-[0-9]{4}-[0-9]+$'
)
INSERT INTO core_sequences (tenant_id, sequence_type, scope_key, prefix, sequence_year, digits, current_value)
SELECT tenant_id,
       'maintenance.request_no',
       camp_id::TEXT,
       prefix,
       (parts[1])::INTEGER,
       4,
       max(current_value)
FROM numbered
GROUP BY tenant_id, camp_id, prefix, parts[1];
