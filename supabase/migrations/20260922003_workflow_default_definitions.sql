INSERT INTO workflow_definitions (
  id,
  tenant_id,
  name,
  steps_config,
  sla_hours,
  escalation_enabled,
  delegation_enabled,
  is_active,
  created_at,
  updated_at
)
SELECT
  uuid_generate_v7(),
  tenants.id,
  'Default Advanced Approval',
  '{"amount_rules":[{"min":0,"max":1000000,"steps":[{"order":1,"role":"APPROVER","quorum":1}]},{"min":1000000,"max":10000000,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1}]},{"min":10000000,"max":null,"steps":[{"order":1,"role":"APPROVER","quorum":1},{"order":2,"role":"APPROVER","quorum":1},{"order":3,"role":"APPROVER","quorum":1}]}],"default_sla_hours":48,"escalation_enabled":true,"delegation_enabled":true}'::jsonb,
  48,
  true,
  true,
  true,
  clock_timestamp(),
  clock_timestamp()
FROM tenants
WHERE NOT EXISTS (
  SELECT 1
  FROM workflow_definitions
  WHERE workflow_definitions.tenant_id = tenants.id
    AND workflow_definitions.is_active = true
);