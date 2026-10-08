INSERT INTO core_users (id, tenant_id, auth_id, email, full_name, role, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000003',
  '3e021487-8e45-4627-8326-a802901a0ec1',
  'admin@test.mn',
  'Admin User',
  'approver',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (auth_id) DO NOTHING
RETURNING id, email, role, tenant_id;