INSERT INTO installed_modules (tenant_id, module_id, version, status, manifest_snapshot)
SELECT
  tenant.id,
  module.module_id,
  '0.2.4',
  CASE WHEN module.default_active THEN 'ACTIVE' ELSE 'SUSPENDED' END,
  jsonb_build_object('moduleId', module.module_id, 'dependencies', module.dependencies)
FROM tenants AS tenant
CROSS JOIN (
  VALUES
    ('core', TRUE, ARRAY[]::TEXT[]),
    ('hr', TRUE, ARRAY[]::TEXT[]),
    ('camp', TRUE, ARRAY['hr']::TEXT[]),
    ('feed', TRUE, ARRAY[]::TEXT[]),
    ('mr', FALSE, ARRAY[]::TEXT[]),
    ('workflow', FALSE, ARRAY[]::TEXT[]),
    ('budget', FALSE, ARRAY[]::TEXT[]),
    ('inventory', FALSE, ARRAY[]::TEXT[]),
    ('vendors', FALSE, ARRAY[]::TEXT[]),
    ('reports', FALSE, ARRAY[]::TEXT[]),
    ('mfe', FALSE, ARRAY[]::TEXT[])
) AS module(module_id, default_active, dependencies)
ON CONFLICT (tenant_id, module_id) DO NOTHING;
