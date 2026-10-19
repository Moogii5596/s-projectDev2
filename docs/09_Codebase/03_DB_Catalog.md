---
title: "DB каталог (migration-аас)"
type: "Database"
status: "Active"
last_updated: 2026-10-19
tags: [codebase, database, rls, generated]
---

# DB каталог (migration-аас)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `supabase/migrations/*.sql` (50 файл, дарааллаар задалсан — MIG-001: schema = migration, Prisma нь зөвхөн client). Нийт **66** хүснэгт, 36 enum, 25 функц, 55 trigger.

Тэмдэглэгээ: PK · NN = NOT NULL · UQ = unique · → = FK. RLS: 🔒 enabled, 🔒🔒 enabled + FORCE, 🌐 tenant_id-гүй глобал хүснэгт. `camp_apply_tenant_rls()` болон `DO $$ FOREACH … ARRAY[…]` RLS загварыг танина; бусад динамик SQL-ийг алгасна — эргэлзээтэй бол migration-ыг нээ. RLS загвар: [[ADR-001_Tenant_Isolation]], [[03_Module_Template]].

## Агуулга

**Бусад (tenant, MR, workflow, event bus, модулиуд):** [[#approval_logs]] · [[#auth_guard.password_failures]] · [[#budget_allocations]] · [[#budget_commitments]] · [[#budget_periods]] · [[#dlq_events]] · [[#i18n_override_history]] · [[#i18n_overrides]] · [[#idempotency_keys]] · [[#installed_modules]] · [[#inventory_items]] · [[#mr_headers]] · [[#mr_items]] · [[#outbox_events]] · [[#super_admins]] · [[#tenant_routes]] · [[#tenants]] · [[#vendors]] · [[#workflow_definitions]] · [[#workflow_delegations]] · [[#workflow_instances]] · [[#workflow_sla_logs]] · [[#workflow_step_logs]]

**Кемп (`camp_*`):** [[#camp_asset_categories]] · [[#camp_asset_movements]] · [[#camp_assets]] · [[#camp_audit_log]] · [[#camp_building_types]] · [[#camp_buildings]] · [[#camp_contract_item_prices]] · [[#camp_contract_items]] · [[#camp_contracts]] · [[#camp_cost_entries]] · [[#camp_crews]] · [[#camp_data_imports]] · [[#camp_department_shift_patterns]] · [[#camp_departments]] · [[#camp_employee_phones]] · [[#camp_employees]] · [[#camp_haul_records]] · [[#camp_maintenance_parts]] · [[#camp_maintenance_requests]] · [[#camp_meal_locations]] · [[#camp_meal_order_lines]] · [[#camp_meal_orders]] · [[#camp_movement_imports]] · [[#camp_movements]] · [[#camp_organizations]] · [[#camp_permissions]] · [[#camp_pii_access_log]] · [[#camp_position_role_templates]] · [[#camp_position_settings]] · [[#camp_position_shift_patterns]] · [[#camp_positions]] · [[#camp_role_permissions]] · [[#camp_roles]] · [[#camp_room_allocations]] · [[#camp_rooms]] · [[#camp_settings]] · [[#camp_shift_adjustments]] · [[#camp_stays]] · [[#camp_user_permissions]] · [[#camp_user_roles]] · [[#camps]]

**Үндсэн (`core_*`):** [[#core_user_invites]] · [[#core_users]]

## Бусад (tenant, MR, workflow, event bus, модулиуд)

### approval_logs

🔒🔒 · үүсгэсэн `0005_approval_flow.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| mr_id | UUID | NN | → mr_headers (cascade) |
| approver_id | UUID | NN | → core_users |
| action | TEXT | NN |  |
| reason | TEXT |  |  |
| notes | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (mr_id, approver_id, action)`

Policy: `rls_approval_logs_tenant` (restrictive ALL → app_user) · `tenant_isolation_approval_logs` (permissive ALL → app_user (DO-блок))

### auth_guard.password_failures

🌐 глобал (tenant_id-гүй, RLS-гүй) · үүсгэсэн `20261012006_auth_password_guard.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| user_id | UUID | PK | → auth.users (cascade) |
| failed_count | INTEGER | NN |  |
| window_start | TIMESTAMPTZ | NN |  |
| locked_until | TIMESTAMPTZ |  |  |

### budget_allocations

🔒🔒 · үүсгэсэн `20261008002_budget.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| period_id | UUID | NN | → budget_periods (cascade) |
| department | TEXT | NN |  |
| total_amount | NUMERIC(18,2) | NN |  |
| committed_amount | NUMERIC(18,2) | NN |  |
| spent_amount | NUMERIC(18,2) | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (committed_amount + spent_amount <= total_amount)`

Policy: `tenant_isolation_budget_allocations` (permissive ALL → app_user)

### budget_commitments

🔒🔒 · үүсгэсэн `20261008002_budget.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| allocation_id | UUID | NN | → budget_allocations |
| mr_header_id | UUID | NN | → mr_headers (cascade) |
| amount | NUMERIC(18,2) | NN |  |
| status | TEXT | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (mr_header_id)`

Policy: `tenant_isolation_budget_commitments` (permissive ALL → app_user)

### budget_periods

🔒🔒 · үүсгэсэн `20261008002_budget.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| period_type | TEXT | NN |  |
| start_date | DATE | NN |  |
| end_date | DATE | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (end_date >= start_date)`

Policy: `tenant_isolation_budget_periods` (permissive ALL → app_user)

### dlq_events

🔒🔒 · үүсгэсэн `20260921002_event_bus_cloudevents.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| original_event | JSONB | NN |  |
| error_message | TEXT | NN |  |
| retry_count | INTEGER | NN |  |
| max_retries | INTEGER | NN |  |
| next_retry_at | TIMESTAMPTZ |  |  |
| status | TEXT | NN |  |
| created_at | TIMESTAMPTZ | NN |  |

Policy: `rls_dlq_events` (restrictive ALL → app_user) · `tenant_isolation_dlq_events` (permissive ALL → app_user (DO-блок))

### i18n_override_history

🔒🔒 · үүсгэсэн `20261011005_i18n_overrides.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| key | TEXT | NN |  |
| lang | TEXT | NN |  |
| old_text | TEXT |  |  |
| new_text | TEXT |  |  |
| source | TEXT | NN |  |
| changed_by | UUID | NN |  |
| changed_at | TIMESTAMPTZ | NN |  |

Constraint: `FOREIGN KEY (tenant_id, changed_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_i18n_override_history` (permissive ALL → app_user (DO-блок))

### i18n_overrides

🔒🔒 · үүсгэсэн `20261011005_i18n_overrides.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| tenant_id | UUID | NN | → tenants (cascade) |
| key | TEXT | NN |  |
| lang | TEXT | NN |  |
| text | TEXT | NN |  |
| updated_by | UUID | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `PRIMARY KEY (tenant_id, key, lang)` · `FOREIGN KEY (tenant_id, updated_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_i18n_overrides` (permissive ALL → app_user (DO-блок))

### idempotency_keys

🔒🔒 · үүсгэсэн `20260921001_workflow_engine.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| key | TEXT | NN |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| response_code | INTEGER | NN |  |
| response_body | JSONB | NN |  |
| expires_at | TIMESTAMPTZ | NN |  |

Constraint: `PRIMARY KEY (key, tenant_id)`

Policy: `rls_idempotency_keys` (restrictive ALL → app_user) · `tenant_isolation_idempotency_keys` (permissive ALL → app_user (DO-блок))

### installed_modules

🔒🔒 · үүсгэсэн `0006_sprint0_preflight.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| module_id | VARCHAR(64) | NN |  |
| version | VARCHAR(32) | NN |  |
| status | VARCHAR(32) | NN |  |
| drain_started_at | TIMESTAMPTZ |  |  |
| manifest_snapshot | JSONB | NN |  |
| installed_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, module_id)` · `CHECK ( status IN ('INSTALLED', 'ACTIVE', 'DRAINING', 'SUSPENDED') )`

Policy: `rls_installed_modules_tenant` (restrictive ALL → app_user) · `tenant_isolation_installed_modules` (permissive ALL → app_user (DO-блок))

### inventory_items

🔒🔒 · үүсгэсэн `20261008003_inventory_vendor_lite.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| sku | TEXT | NN |  |
| name | TEXT | NN |  |
| unit | TEXT | NN |  |
| quantity | NUMERIC(15,3) | NN |  |
| min_threshold | NUMERIC(15,3) | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, sku)`

Policy: `tenant_isolation_inventory_items` (permissive ALL → app_user)

### mr_headers

🔒🔒 · үүсгэсэн `0001_initial_schema.sql` · өөрчлөлт: +approved_by (`0005_approval_flow.sql`), +approved_at (`0005_approval_flow.sql`), +workflow_instance_id (`0006_sprint0_preflight.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| mr_number | TEXT | NN |  |
| title | TEXT | NN |  |
| status | "MrStatus" | NN |  |
| requester_id | UUID | NN | → core_users |
| department | TEXT |  |  |
| required_date | DATE |  |  |
| total_amount | NUMERIC(18, 2) | NN |  |
| currency | TEXT | NN |  |
| notes | TEXT |  |  |
| version | INTEGER | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| approved_by | UUID |  | → core_users |
| approved_at | TIMESTAMPTZ |  |  |
| workflow_instance_id | UUID |  |  |

Constraint: `UNIQUE (tenant_id, mr_number)` · `FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE SET NULL`

Policy: `tenant_isolation_mr_headers_select` (permissive SELECT) · `tenant_isolation_mr_headers_insert` (permissive INSERT) · `tenant_isolation_mr_headers_update` (permissive UPDATE) · `tenant_isolation_mr_headers_delete` (permissive DELETE)

Trigger: `update_mr_headers_updated_at`

### mr_items

🔒🔒 · үүсгэсэн `0001_initial_schema.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| header_id | UUID | NN | → mr_headers (cascade) |
| line_number | INTEGER | NN |  |
| description | TEXT | NN |  |
| unit_of_measure | TEXT | NN |  |
| quantity | NUMERIC(18, 4) | NN |  |
| unit_price | NUMERIC(18, 2) | NN |  |
| total_price | NUMERIC(18, 2) |  |  |
| notes | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (header_id, line_number)`

Policy: `tenant_isolation_mr_items_select` (permissive SELECT) · `tenant_isolation_mr_items_insert` (permissive INSERT) · `tenant_isolation_mr_items_update` (permissive UPDATE) · `tenant_isolation_mr_items_delete` (permissive DELETE)

Trigger: `update_mr_items_updated_at`

### outbox_events

🔒🔒 · үүсгэсэн `0001_initial_schema.sql` · өөрчлөлт: +cloud_event_id (`20260921002_event_bus_cloudevents.sql`), +cloud_event_source (`20260921002_event_bus_cloudevents.sql`), +cloud_event_type (`20260921002_event_bus_cloudevents.sql`), +last_error (`20260921002_event_bus_cloudevents.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| event_type | TEXT | NN |  |
| aggregate_type | TEXT | NN |  |
| aggregate_id | UUID | NN |  |
| payload | JSONB | NN |  |
| status | "OutboxStatus" | NN |  |
| retry_count | INTEGER | NN |  |
| next_retry_at | TIMESTAMPTZ | NN |  |
| error_message | TEXT |  |  |
| published_at | TIMESTAMPTZ |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| cloud_event_id | TEXT |  |  |
| cloud_event_source | TEXT |  |  |
| cloud_event_type | TEXT |  |  |
| last_error | TEXT |  |  |

Policy: `tenant_isolation_outbox_select` (permissive SELECT) · `tenant_isolation_outbox_insert` (permissive INSERT) · `tenant_isolation_outbox_update` (permissive UPDATE)

### super_admins

🔒 · үүсгэсэн `20260921003_tenant_onboarding.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| user_id | UUID | PK | → core_users (cascade) |
| created_at | TIMESTAMPTZ | NN |  |

Policy: `super_admins_service_only` (restrictive ALL → app_user)

### tenant_routes

🔒🔒 · үүсгэсэн `20260921_tenant_routes.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| path | TEXT | NN |  |
| method | TEXT | NN |  |
| target_module | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE(tenant_id, path, method)`

Policy: `rls_tenant_routes_tenant` (restrictive ALL → app_user) · `tenant_isolation_tenant_routes` (permissive ALL → app_user (DO-блок))

### tenants

🌐 глобал (tenant_id-гүй, RLS-гүй) · үүсгэсэн `0001_initial_schema.sql` · өөрчлөлт: +max_users (`20260921003_tenant_onboarding.sql`), +max_mfes (`20260921003_tenant_onboarding.sql`), +onboarded_at (`20260921003_tenant_onboarding.sql`), +schema_name (`20260921004_schema_isolation.sql`), −schema_name (`20261008001_revert_schema_per_tenant.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| slug | TEXT | NN UQ |  |
| name | TEXT | NN |  |
| tier | "TierType" | NN |  |
| is_active | BOOLEAN | NN |  |
| settings | JSONB | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| max_users | INTEGER | NN |  |
| max_mfes | INTEGER | NN |  |
| onboarded_at | TIMESTAMPTZ |  |  |

Trigger: `update_tenants_updated_at` · `trg_tenants_camp_seed_roles`

### vendors

🔒🔒 · үүсгэсэн `20261008003_inventory_vendor_lite.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| reg_number | TEXT |  |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Policy: `tenant_isolation_vendors` (permissive ALL → app_user)

### workflow_definitions

🔒🔒 · үүсгэсэн `20260921001_workflow_engine.sql` · өөрчлөлт: +sla_hours (`20260922001_advanced_workflow.sql`), +escalation_enabled (`20260922001_advanced_workflow.sql`), +delegation_enabled (`20260922001_advanced_workflow.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| steps_config | JSONB | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| sla_hours | INTEGER | NN |  |
| escalation_enabled | BOOLEAN | NN |  |
| delegation_enabled | BOOLEAN | NN |  |

Policy: `rls_workflow_definitions` (restrictive ALL → app_user) · `tenant_isolation_workflow_definitions` (permissive ALL → app_user (DO-блок))

### workflow_delegations

🔒🔒 · үүсгэсэн `20260922001_advanced_workflow.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| delegator_id | UUID | NN |  |
| delegate_id | UUID | NN |  |
| valid_from | TIMESTAMPTZ | NN |  |
| valid_until | TIMESTAMPTZ | NN |  |
| reason | TEXT |  |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (valid_until > valid_from)` · `CHECK (delegator_id <> delegate_id)`

Policy: `rls_workflow_delegations` (restrictive ALL → app_user) · `tenant_isolation_workflow_delegations` (permissive ALL → app_user (DO-блок))

### workflow_instances

🔒🔒 · үүсгэсэн `20260921001_workflow_engine.sql` · өөрчлөлт: +escalation_count (`20260922001_advanced_workflow.sql`), +resolved_steps (`20260922002_workflow_resolved_steps.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| definition_id | UUID | NN | → workflow_definitions |
| entity_type | TEXT | NN |  |
| entity_id | UUID | NN |  |
| current_step | INTEGER | NN |  |
| status | TEXT | NN |  |
| locked_by | UUID |  |  |
| locked_at | TIMESTAMPTZ |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| escalation_count | INTEGER | NN |  |
| resolved_steps | JSONB |  |  |

Policy: `rls_workflow_instances` (restrictive ALL → app_user) · `tenant_isolation_workflow_instances` (permissive ALL → app_user (DO-блок))

### workflow_sla_logs

🔒🔒 · үүсгэсэн `20260922001_advanced_workflow.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| instance_id | UUID | NN | → workflow_instances (cascade) |
| step_order | INTEGER | NN |  |
| assigned_to_id | UUID | NN |  |
| due_at | TIMESTAMPTZ | NN |  |
| escalated_at | TIMESTAMPTZ |  |  |
| escalated_to_id | UUID |  |  |
| completed_at | TIMESTAMPTZ |  |  |
| status | TEXT | NN |  |
| created_at | TIMESTAMPTZ | NN |  |

Policy: `rls_workflow_sla_logs` (restrictive ALL → app_user) · `tenant_isolation_workflow_sla_logs` (permissive ALL → app_user (DO-блок))

### workflow_step_logs

🔒🔒 · үүсгэсэн `20260921001_workflow_engine.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| instance_id | UUID | NN | → workflow_instances (cascade) |
| step_order | INTEGER | NN |  |
| actor_id | UUID | NN |  |
| action | TEXT | NN |  |
| comment | TEXT |  |  |
| acted_at | TIMESTAMPTZ | NN |  |

Policy: `rls_workflow_step_logs` (restrictive ALL → app_user) · `tenant_isolation_workflow_step_logs` (permissive ALL → app_user (DO-блок))

## Кемп (`camp_*`)

### camp_asset_categories

🔒🔒 · үүсгэсэн `20261009004_camp_assets_maintenance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, name)`

Policy: `tenant_isolation_camp_asset_categories` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_asset_categories_updated_at`

### camp_asset_movements

🔒🔒 · үүсгэсэн `20261009004_camp_assets_maintenance.sql` · өөрчлөлт: +from_building_id (`20261012005_camp_building_types_asset_building.sql`), +to_building_id (`20261012005_camp_building_types_asset_building.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| asset_id | UUID | NN |  |
| from_room_id | UUID |  |  |
| to_room_id | UUID |  |  |
| moved_at | TIMESTAMPTZ | NN |  |
| moved_by | UUID | NN |  |
| reason | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| from_building_id | UUID |  |  |
| to_building_id | UUID |  |  |

Constraint: `CHECK (from_room_id IS DISTINCT FROM to_room_id)` · `FOREIGN KEY (tenant_id, camp_id, asset_id) REFERENCES camp_assets (tenant_id, camp_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id, from_room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, to_room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, moved_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, from_building_id) REFERENCES camp_buildings (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, to_building_id) REFERENCES camp_buildings (tenant_id, camp_id, id)` · `CHECK (from_room_id IS NULL OR from_building_id IS NULL)` · `CHECK (to_room_id IS NULL OR to_building_id IS NULL)` · `CHECK ((from_room_id, from_building_id) IS DISTINCT FROM (to_room_id, to_building_id))`

Policy: `tenant_isolation_camp_asset_movements` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_asset_movements_updated_at`

### camp_assets

🔒🔒 · үүсгэсэн `20261009004_camp_assets_maintenance.sql` · өөрчлөлт: +building_id (`20261012005_camp_building_types_asset_building.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| category_id | UUID | NN |  |
| inventory_no | TEXT | NN |  |
| name | TEXT | NN |  |
| serial_no | TEXT |  |  |
| room_id | UUID |  |  |
| condition | "CampAssetCondition" | NN |  |
| acquired_date | DATE |  |  |
| acquired_cost | NUMERIC(18,2) |  |  |
| note | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| building_id | UUID |  |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, inventory_no)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, category_id) REFERENCES camp_asset_categories (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, building_id) REFERENCES camp_buildings (tenant_id, camp_id, id)` · `CHECK (room_id IS NULL OR building_id IS NULL)`

Policy: `tenant_isolation_camp_assets` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_assets_updated_at`

### camp_audit_log

🔒🔒 · үүсгэсэн `20261011001_camp_audit_log.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID |  |  |
| entity_type | TEXT | NN |  |
| entity_id | UUID | NN |  |
| action | "CampAuditAction" | NN |  |
| actor_user_id | UUID | NN |  |
| summary_key | TEXT | NN |  |
| summary_params | JSONB | NN |  |
| diff | JSONB | NN |  |
| import_id | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (jsonb_typeof(diff) = 'object')` · `CHECK (jsonb_typeof(summary_params) = 'object')` · `FOREIGN KEY (tenant_id, actor_user_id) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)`

Policy: `tenant_isolation_camp_audit_log` (permissive ALL → app_user)

### camp_building_types

🔒🔒 · үүсгэсэн `20261012005_camp_building_types_asset_building.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)`

Policy: `tenant_isolation_camp_building_types` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_building_types_updated_at`

### camp_buildings

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql` · өөрчлөлт: +type_id (`20261012005_camp_building_types_asset_building.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| code | TEXT | NN |  |
| name | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| type_id | UUID |  |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, camp_id, code)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, type_id) REFERENCES camp_building_types (tenant_id, id)`

Policy: `tenant_isolation_camp_buildings` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_buildings_updated_at`

### camp_contract_item_prices

🔒🔒 · үүсгэсэн `20261009005_camp_contracts.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| contract_item_id | UUID | NN |  |
| effective_from | DATE | NN |  |
| unit_price | NUMERIC(18,2) | NN |  |
| vat_included | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (contract_item_id, effective_from)` · `FOREIGN KEY (tenant_id, contract_item_id) REFERENCES camp_contract_items (tenant_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_contract_item_prices` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_contract_item_prices_updated_at`

### camp_contract_items

🔒🔒 · үүсгэсэн `20261009005_camp_contracts.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| contract_id | UUID | NN |  |
| service_type | "CampServiceType" | NN |  |
| unit | "CampContractUnit" | NN |  |
| description | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (contract_id, service_type)` · `CHECK ( (service_type = 'MEAL') = (unit = 'PERSON_DAY'))` · `FOREIGN KEY (tenant_id, camp_id, contract_id) REFERENCES camp_contracts (tenant_id, camp_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_contract_items` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_contract_items_updated_at`

### camp_contracts

🔒🔒 · үүсгэсэн `20261009005_camp_contracts.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| organization_id | UUID | NN |  |
| contract_no | TEXT | NN |  |
| title | TEXT | NN |  |
| start_date | DATE | NN |  |
| end_date | DATE |  |  |
| status | "CampContractStatus" | NN |  |
| terminated_at | DATE |  |  |
| note | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, contract_no)` · `CHECK (end_date IS NULL OR end_date >= start_date)` · `CHECK ((status = 'TERMINATED') = (terminated_at IS NOT NULL))` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id)`

Policy: `tenant_isolation_camp_contracts` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_contracts_updated_at`

### camp_cost_entries

🔒🔒 · үүсгэсэн `20261009006_camp_operations.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| cost_date | DATE | NN |  |
| source | "CampCostSource" | NN |  |
| haul_record_id | UUID |  |  |
| meal_order_id | UUID |  |  |
| maintenance_part_id | UUID |  |  |
| service_type | "CampServiceType" |  |  |
| contract_item_id | UUID |  |  |
| organization_id | UUID |  |  |
| description | TEXT |  |  |
| quantity | NUMERIC(15,4) | NN |  |
| unit | TEXT | NN |  |
| unit_price | NUMERIC(18,2) | NN |  |
| vat_included | BOOLEAN | NN |  |
| vat_rate | NUMERIC(5,2) | NN |  |
| net_amount | NUMERIC(18,2) | NN |  |
| vat_amount | NUMERIC(18,2) | NN |  |
| gross_amount | NUMERIC(18,2) | NN |  |
| created_by | UUID | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (net_amount + vat_amount = gross_amount)` · `CHECK ( (source = 'HAUL' AND haul_record_id IS NOT NULL AND meal_order_id IS NULL AND maintenance_part_id IS NULL AND contract_item_id IS NO` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, haul_record_id) REFERENCES camp_haul_records (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, meal_order_id) REFERENCES camp_meal_orders (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, maintenance_part_id) REFERENCES camp_maintenance_parts (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, contract_item_id) REFERENCES camp_contract_items (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id)` · `FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_cost_entries` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_cost_entries_immutable` · `trg_camp_cost_entries_updated_at`

### camp_crews

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| code | TEXT | NN |  |
| name | TEXT |  |  |
| roster_anchor_date | DATE | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, camp_id, code)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)`

Policy: `tenant_isolation_camp_crews` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_crews_updated_at`

### camp_data_imports

🔒🔒 · үүсгэсэн `20261011002_camp_data_imports.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| type | "CampDataImportType" | NN |  |
| source | "CampDataImportSource" | NN |  |
| file_name | TEXT |  |  |
| status | "CampDataImportStatus" | NN |  |
| total_rows | INTEGER | NN |  |
| create_rows | INTEGER | NN |  |
| update_rows | INTEGER | NN |  |
| unchanged_rows | INTEGER | NN |  |
| error_rows | INTEGER | NN |  |
| parsed_rows | JSONB | NN |  |
| uploaded_by | UUID | NN |  |
| confirmed_by | UUID |  |  |
| confirmed_at | TIMESTAMPTZ |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (create_rows + update_rows + unchanged_rows + error_rows = total_rows)` · `CHECK ((status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))` · `CHECK (jsonb_typeof(parsed_rows) = 'array')` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, uploaded_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, confirmed_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_data_imports` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_data_imports_updated_at`

### camp_department_shift_patterns

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| department_id | UUID | NN |  |
| day_from | SMALLINT | NN |  |
| day_to | SMALLINT | NN |  |
| shift | "CampShiftType" | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (day_from >= 1 AND day_to >= day_from AND day_to <= 28)` · `FOREIGN KEY (tenant_id, department_id) REFERENCES camp_departments (tenant_id, id) ON DELETE CASCADE` · `EXCLUDE USING gist ( department_id WITH =, int4range(day_from, day_to, '[]') WITH &&)`

Policy: `tenant_isolation_camp_department_shift_patterns` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_department_shift_patterns_updated_at`

### camp_departments

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| code | TEXT | NN |  |
| name | TEXT | NN |  |
| meal_location_id | UUID |  |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, camp_id, code)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, meal_location_id) REFERENCES camp_meal_locations (tenant_id, camp_id, id)`

Policy: `tenant_isolation_camp_departments` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_departments_updated_at`

### camp_employee_phones

🔒🔒 · үүсгэсэн `20261019002_hr_employee_names_phones.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK NN |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| employee_id | UUID | NN |  |
| phone | TEXT | NN |  |
| sort_order | SMALLINT | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (phone ~ '^(\+[0-9]{8,15}\|[0-9]{8})$')` · `UNIQUE (tenant_id, employee_id, phone)` · `FOREIGN KEY (tenant_id, employee_id) REFERENCES camp_employees (tenant_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_employee_phones` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_employee_phones_updated_at`

### camp_employees

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql` · өөрчлөлт: +email (`20261011003_camp_employees_email.sql`), +position_id (`20261012003_camp_employees_position_meals.sql`), +meal_location_id (`20261012003_camp_employees_position_meals.sql`), +meals_included (`20261012003_camp_employees_position_meals.sql`), +user_id (`20261013004_core_users_login.sql`), +terminated_at (`20261017002_camp_employees_termination.sql`), +termination_reason (`20261017002_camp_employees_termination.sql`), +termination_note (`20261017002_camp_employees_termination.sql`), +rehired_from_id (`20261017002_camp_employees_termination.sql`), +family_name (`20261019002_hr_employee_names_phones.sql`), +last_name (`20261019002_hr_employee_names_phones.sql`), +first_name (`20261019002_hr_employee_names_phones.sql`), +data_issues (`20261019003_hr_employee_data_issues.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| organization_id | UUID | NN |  |
| department_id | UUID | NN |  |
| crew_id | UUID |  |  |
| employee_code | TEXT | NN |  |
| full_name | TEXT | NN |  |
| position | TEXT |  |  |
| phone | TEXT |  |  |
| status | "CampEmployeeStatus" | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| email | TEXT |  |  |
| position_id | UUID |  |  |
| meal_location_id | UUID |  |  |
| meals_included | BOOLEAN |  |  |
| user_id | UUID |  |  |
| terminated_at | DATE |  |  |
| termination_reason | "CampTerminationReason" |  |  |
| termination_note | TEXT |  |  |
| rehired_from_id | UUID |  |  |
| family_name | TEXT |  |  |
| last_name | TEXT |  |  |
| first_name | TEXT | NN |  |
| data_issues | JSONB | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, employee_code)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, organization_id) REFERENCES camp_organizations (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, department_id) REFERENCES camp_departments (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, crew_id) REFERENCES camp_crews (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, position_id) REFERENCES camp_positions (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, meal_location_id) REFERENCES camp_meal_locations (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, user_id) REFERENCES core_users (tenant_id, id) ON DELETE SET NULL (user_id)` · `CHECK ( (status = 'TERMINATED') = (terminated_at IS NOT NULL AND termination_reason IS NOT NULL) )` · `CHECK ( termination_reason IS DISTINCT FROM 'OTHER' OR btrim(coalesce(termination_note, '')) <> '' )` · `FOREIGN KEY (tenant_id, rehired_from_id) REFERENCES camp_employees (tenant_id, id)` · `CHECK (btrim(first_name) <> '')` · `CHECK (jsonb_typeof(data_issues) = 'array')` · `CHECK ( (status = 'TERMINATED') = ( termination_reason IS NOT NULL AND (terminated_at IS NOT NULL OR data_issues @> '[{"field": "terminatedA`

Policy: `tenant_isolation_camp_employees` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_employees_updated_at` · `trg_camp_employees_position_roles` · `trg_camp_employees_names`

### camp_haul_records

🔒🔒 · үүсгэсэн `20261009006_camp_operations.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| record_no | TEXT | NN |  |
| haul_type | "CampHaulType" | NN |  |
| haul_date | DATE | NN |  |
| vehicle_no | TEXT |  |  |
| driver_name | TEXT |  |  |
| trips | INTEGER | NN |  |
| volume | NUMERIC(15,3) |  |  |
| volume_unit | "CampVolumeUnit" |  |  |
| transport_contract_item_id | UUID | NN |  |
| disposal_contract_item_id | UUID | NN |  |
| status | "CampHaulStatus" | NN |  |
| note | TEXT |  |  |
| created_by | UUID | NN |  |
| submitted_at | TIMESTAMPTZ |  |  |
| reviewed_by | UUID |  |  |
| reviewed_at | TIMESTAMPTZ |  |  |
| reject_reason | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, record_no)` · `CHECK ((volume IS NULL) = (volume_unit IS NULL))` · `CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL)` · `CHECK ( (status IN ('APPROVED', 'REJECTED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))` · `CHECK (status <> 'REJECTED' OR btrim(coalesce(reject_reason, '')) <> '')` · `CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, transport_contract_item_id) REFERENCES camp_contract_items (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, disposal_contract_item_id) REFERENCES camp_contract_items (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, reviewed_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_haul_records` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_haul_records_guard` · `trg_camp_haul_records_updated_at`

### camp_maintenance_parts

🔒🔒 · үүсгэсэн `20261009004_camp_assets_maintenance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| request_id | UUID | NN |  |
| part_name | TEXT | NN |  |
| quantity | NUMERIC(15,3) | NN |  |
| unit | TEXT | NN |  |
| unit_price | NUMERIC(18,2) |  |  |
| vat_included | BOOLEAN | NN |  |
| source | "CampPartSource" | NN |  |
| created_by | UUID | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `CHECK (source <> 'CATERING_PURCHASED' OR unit_price IS NOT NULL)` · `FOREIGN KEY (tenant_id, request_id) REFERENCES camp_maintenance_requests (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_maintenance_parts` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_maintenance_parts_protect` · `trg_camp_maintenance_parts_updated_at`

### camp_maintenance_requests

🔒🔒 · үүсгэсэн `20261009004_camp_assets_maintenance.sql` · өөрчлөлт: +blocks_room (`20261010002_camp_org_services_maintenance.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| request_no | TEXT | NN |  |
| room_id | UUID |  |  |
| asset_id | UUID |  |  |
| title | TEXT | NN |  |
| description | TEXT |  |  |
| priority | "CampMaintenancePriority" | NN |  |
| status | "CampMaintenanceStatus" | NN |  |
| reported_by | UUID | NN |  |
| started_at | TIMESTAMPTZ |  |  |
| completed_at | TIMESTAMPTZ |  |  |
| closed_by | UUID |  |  |
| closed_at | TIMESTAMPTZ |  |  |
| cancel_reason | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| blocks_room | BOOLEAN | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, request_no)` · `CHECK (room_id IS NOT NULL OR asset_id IS NOT NULL)` · `CHECK ((status = 'CLOSED') = (closed_by IS NOT NULL AND closed_at IS NOT NULL))` · `CHECK (status <> 'CANCELLED' OR btrim(coalesce(cancel_reason, '')) <> '')` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, asset_id) REFERENCES camp_assets (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, reported_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, closed_by) REFERENCES core_users (tenant_id, id)` · `CHECK (NOT blocks_room OR room_id IS NOT NULL)`

Policy: `tenant_isolation_camp_maintenance_requests` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_maintenance_requests_protect` · `trg_camp_maintenance_requests_updated_at`

### camp_meal_locations

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| name | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, camp_id, name)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)`

Policy: `tenant_isolation_camp_meal_locations` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_meal_locations_updated_at`

### camp_meal_order_lines

🔒🔒 · үүсгэсэн `20261009006_camp_operations.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| order_id | UUID | NN |  |
| meal_type | "CampMealType" | NN |  |
| meal_location_id | UUID | NN |  |
| base_count | INTEGER | NN |  |
| extra_count | INTEGER | NN |  |
| extra_note | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (order_id, meal_type, meal_location_id)` · `CHECK (base_count + extra_count >= 0)` · `FOREIGN KEY (tenant_id, camp_id, order_id) REFERENCES camp_meal_orders (tenant_id, camp_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id, meal_location_id) REFERENCES camp_meal_locations (tenant_id, camp_id, id)`

Policy: `tenant_isolation_camp_meal_order_lines` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_meal_order_lines_guard` · `trg_camp_meal_order_lines_updated_at`

### camp_meal_orders

🔒🔒 · үүсгэсэн `20261009006_camp_operations.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| order_date | DATE | NN |  |
| meal_contract_item_id | UUID |  |  |
| status | "CampMealOrderStatus" | NN |  |
| note | TEXT |  |  |
| ordered_by | UUID |  |  |
| ordered_at | TIMESTAMPTZ |  |  |
| reviewed_by | UUID |  |  |
| reviewed_at | TIMESTAMPTZ |  |  |
| reject_reason | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, camp_id, order_date)` · `CHECK (status = 'DRAFT' OR meal_contract_item_id IS NOT NULL)` · `CHECK ( status = 'DRAFT' OR (ordered_by IS NOT NULL AND ordered_at IS NOT NULL))` · `CHECK ( (status IN ('ACCEPTED', 'REJECTED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))` · `CHECK (status <> 'REJECTED' OR btrim(coalesce(reject_reason, '')) <> '')` · `CHECK (reviewed_by IS NULL OR reviewed_by <> ordered_by)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, camp_id, meal_contract_item_id) REFERENCES camp_contract_items (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, ordered_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, reviewed_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_meal_orders` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_meal_orders_guard` · `trg_camp_meal_orders_updated_at`

### camp_movement_imports

🔒🔒 · үүсгэсэн `20261009003_camp_attendance.sql` · өөрчлөлт: +parsed_rows (`20261010001_camp_attendance_import.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| file_name | TEXT | NN |  |
| status | "CampImportStatus" | NN |  |
| total_rows | INTEGER | NN |  |
| ok_rows | INTEGER | NN |  |
| error_rows | INTEGER | NN |  |
| errors | JSONB | NN |  |
| uploaded_by | UUID | NN |  |
| confirmed_by | UUID |  |  |
| confirmed_at | TIMESTAMPTZ |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| parsed_rows | JSONB | NN |  |

Constraint: `UNIQUE (tenant_id, camp_id, id)` · `CHECK (ok_rows + error_rows = total_rows)` · `CHECK ( (status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, uploaded_by) REFERENCES core_users (tenant_id, id)` · `FOREIGN KEY (tenant_id, confirmed_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_movement_imports` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_movement_imports_updated_at`

### camp_movements

🔒🔒 · үүсгэсэн `20261009003_camp_attendance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| employee_id | UUID | NN |  |
| movement_date | DATE | NN |  |
| direction | "CampMovementDirection" | NN |  |
| kind | "CampMovementKind" | NN |  |
| meals | "CampMealType"[] | NN |  |
| import_id | UUID |  |  |
| created_by | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, employee_id, movement_date, direction)` · `CHECK (array_position(meals, NULL) IS NULL)` · `FOREIGN KEY (tenant_id, camp_id, employee_id) REFERENCES camp_employees (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, import_id) REFERENCES camp_movement_imports (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)`

Policy: `tenant_isolation_camp_movements` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_movements_updated_at`

### camp_organizations

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql` · өөрчлөлт: +service_types (`20261010002_camp_org_services_maintenance.sql`), −is_disposal_point (`20261010002_camp_org_services_maintenance.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| reg_number | TEXT |  |  |
| org_type | "CampOrgType" | NN |  |
| contact_name | TEXT |  |  |
| phone | TEXT |  |  |
| email | TEXT |  |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| service_types | "CampOrgServiceType"[] | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `CHECK (array_position(service_types, NULL) IS NULL)`

Policy: `tenant_isolation_camp_organizations` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_organizations_updated_at`

### camp_permissions

🌐 глобал (tenant_id-гүй, RLS-гүй) · үүсгэсэн `20261009001_camp_rbac.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| code | TEXT | PK |  |
| name | TEXT | NN |  |
| sort_order | INTEGER | NN |  |
| created_at | TIMESTAMPTZ | NN |  |

### camp_pii_access_log

🔒🔒 · үүсгэсэн `20261017003_camp_pii_access_log.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK NN |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| viewer_user_id | UUID | NN |  |
| employee_id | UUID | NN |  |
| context | TEXT | NN |  |
| viewed_at | TIMESTAMPTZ | NN |  |

Constraint: `FOREIGN KEY (tenant_id, viewer_user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, employee_id) REFERENCES camp_employees (tenant_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_pii_access_log` (permissive ALL → app_user)

### camp_position_role_templates

🔒🔒 · үүсгэсэн `20261013002_camp_position_role_templates.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| tenant_id | UUID | NN | → tenants (cascade) |
| position_id | UUID | NN |  |
| role_id | UUID | NN |  |
| scope | "CampTemplateScope" | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `PRIMARY KEY (position_id, role_id)` · `FOREIGN KEY (tenant_id, position_id) REFERENCES camp_positions (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, role_id) REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_position_role_templates` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_position_role_templates_updated_at`

### camp_position_settings

🔒🔒 · үүсгэсэн `20261012002_camp_position_settings.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| position_id | UUID | NN |  |
| meal_location_id | UUID |  |  |
| meals_included | BOOLEAN |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, position_id)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id)` · `FOREIGN KEY (tenant_id, position_id) REFERENCES camp_positions (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id, meal_location_id) REFERENCES camp_meal_locations (tenant_id, camp_id, id)`

Policy: `tenant_isolation_camp_position_settings` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_position_settings_updated_at`

### camp_position_shift_patterns

🔒🔒 · үүсгэсэн `20261012002_camp_position_settings.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| position_setting_id | UUID | NN |  |
| day_from | SMALLINT | NN |  |
| day_to | SMALLINT | NN |  |
| shift | "CampShiftType" | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (day_from >= 1 AND day_to >= day_from AND day_to <= 28)` · `FOREIGN KEY (tenant_id, position_setting_id) REFERENCES camp_position_settings (tenant_id, id) ON DELETE CASCADE` · `EXCLUDE USING gist ( position_setting_id WITH =, int4range(day_from, day_to, '[]') WITH &&)`

Policy: `tenant_isolation_camp_position_shift_patterns` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_position_shift_patterns_updated_at`

### camp_positions

🔒🔒 · үүсгэсэн `20261012001_camp_positions.sql` · өөрчлөлт: +code (`20261019002_hr_employee_names_phones.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| code | TEXT |  |  |

Constraint: `UNIQUE (tenant_id, id)`

Policy: `tenant_isolation_camp_positions` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_positions_updated_at`

### camp_role_permissions

🔒🔒 · үүсгэсэн `20261009001_camp_rbac.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| tenant_id | UUID | NN | → tenants (cascade) |
| role_id | UUID | NN |  |
| permission_code | TEXT | NN | → camp_permissions |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `PRIMARY KEY (role_id, permission_code)` · `FOREIGN KEY (tenant_id, role_id) REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE`

Policy: `tenant_isolation_camp_role_permissions` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_role_permissions_updated_at`

### camp_roles

🔒🔒 · үүсгэсэн `20261009001_camp_rbac.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| name | TEXT | NN |  |
| description | TEXT |  |  |
| is_system | BOOLEAN | NN |  |
| system_code | "CampRoleCode" |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, name)` · `UNIQUE (tenant_id, system_code)` · `CHECK ((system_code IS NOT NULL) = is_system)`

Policy: `tenant_isolation_camp_roles` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_roles_protect_system` · `trg_camp_roles_updated_at`

### camp_room_allocations

🔒🔒 · үүсгэсэн `20261009003_camp_attendance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| room_id | UUID | NN |  |
| employee_id | UUID | NN |  |
| start_date | DATE | NN |  |
| end_date | DATE |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (end_date IS NULL OR end_date >= start_date)` · `FOREIGN KEY (tenant_id, camp_id, room_id) REFERENCES camp_rooms (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, camp_id, employee_id) REFERENCES camp_employees (tenant_id, camp_id, id)` · `EXCLUDE USING gist ( employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`

Policy: `tenant_isolation_camp_room_allocations` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_room_allocations_updated_at`

### camp_rooms

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| building_id | UUID | NN |  |
| room_no | TEXT | NN |  |
| floor | SMALLINT |  |  |
| capacity | SMALLINT | NN |  |
| status | "CampRoomStatus" | NN |  |
| note | TEXT |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, camp_id, id)` · `UNIQUE (tenant_id, building_id, room_no)` · `FOREIGN KEY (tenant_id, camp_id, building_id) REFERENCES camp_buildings (tenant_id, camp_id, id)`

Policy: `tenant_isolation_camp_rooms` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_rooms_updated_at`

### camp_settings

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql` · өөрчлөлт: +catering_organization_id (`20261010002_camp_org_services_maintenance.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| vat_rate | NUMERIC(5,2) | NN |  |
| changeover_weekday | SMALLINT | NN |  |
| roster_on_days | SMALLINT | NN |  |
| roster_off_days | SMALLINT | NN |  |
| meal_order_cutoff_time | TIME |  |  |
| default_meal_location_id | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| catering_organization_id | UUID |  |  |

Constraint: `UNIQUE (tenant_id, camp_id)` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id, default_meal_location_id) REFERENCES camp_meal_locations (tenant_id, camp_id, id)` · `CHECK (roster_off_days BETWEEN 2 AND 28)` · `FOREIGN KEY (tenant_id, catering_organization_id) REFERENCES camp_organizations (tenant_id, id)`

Policy: `tenant_isolation_camp_settings` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_settings_updated_at`

### camp_shift_adjustments

🔒🔒 · үүсгэсэн `20261009003_camp_attendance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| employee_id | UUID | NN |  |
| start_date | DATE | NN |  |
| end_date | DATE | NN |  |
| shift | "CampShiftType" | NN |  |
| reason_type | "CampShiftAdjustmentReason" | NN |  |
| reason | TEXT |  |  |
| created_by | UUID | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `CHECK (end_date >= start_date)` · `CHECK (reason_type <> 'OTHER' OR btrim(coalesce(reason, '')) <> '')` · `FOREIGN KEY (tenant_id, employee_id) REFERENCES camp_employees (tenant_id, id)` · `FOREIGN KEY (tenant_id, created_by) REFERENCES core_users (tenant_id, id)` · `EXCLUDE USING gist ( employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`

Policy: `tenant_isolation_camp_shift_adjustments` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_shift_adjustments_updated_at`

### camp_stays

🔒🔒 · үүсгэсэн `20261009003_camp_attendance.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| camp_id | UUID | NN |  |
| employee_id | UUID | NN |  |
| arrival_movement_id | UUID | NN |  |
| departure_movement_id | UUID |  |  |
| start_date | DATE | NN |  |
| end_date | DATE |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (arrival_movement_id)` · `UNIQUE (departure_movement_id)` · `CHECK (end_date IS NULL OR end_date >= start_date)` · `CHECK ((end_date IS NULL) = (departure_movement_id IS NULL))` · `FOREIGN KEY (tenant_id, camp_id, employee_id) REFERENCES camp_employees (tenant_id, camp_id, id)` · `FOREIGN KEY (tenant_id, arrival_movement_id) REFERENCES camp_movements (tenant_id, id)` · `FOREIGN KEY (tenant_id, departure_movement_id) REFERENCES camp_movements (tenant_id, id)` · `EXCLUDE USING gist ( employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`

Policy: `tenant_isolation_camp_stays` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_stays_validate` · `trg_camp_stays_updated_at`

### camp_user_permissions

🔒🔒 · үүсгэсэн `20261013001_camp_user_permissions.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| user_id | UUID | NN |  |
| permission_code | TEXT | NN | → camp_permissions |
| camp_id | UUID |  |  |
| source | "CampPermissionSource" | NN |  |
| user_role_id | UUID |  |  |
| created_by | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `FOREIGN KEY (tenant_id, user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, user_role_id) REFERENCES camp_user_roles (tenant_id, id) ON DELETE CASCADE` · `CHECK ((source = 'TEMPLATE') = (user_role_id IS NOT NULL))`

Policy: `tenant_isolation_camp_user_permissions` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_user_permissions_updated_at`

### camp_user_roles

🔒🔒 · үүсгэсэн `20261009001_camp_rbac.sql` · өөрчлөлт: +source_position_id (`20261013004_core_users_login.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| user_id | UUID | NN |  |
| role_id | UUID | NN |  |
| camp_id | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| source_position_id | UUID |  |  |

Constraint: `FOREIGN KEY (tenant_id, user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, role_id) REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE` · `FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE` · `UNIQUE (tenant_id, id)` · `FOREIGN KEY (tenant_id, source_position_id) REFERENCES camp_positions (tenant_id, id) ON DELETE SET NULL (source_position_id)`

Policy: `tenant_isolation_camp_user_roles` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camp_user_roles_updated_at` · `trg_camp_user_roles_apply_template`

### camps

🔒🔒 · үүсгэсэн `20261009002_camp_master.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| code | TEXT | NN |  |
| name | TEXT | NN |  |
| location | TEXT |  |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `UNIQUE (tenant_id, id)` · `UNIQUE (tenant_id, code)`

Policy: `tenant_isolation_camps` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_camps_updated_at`

## Үндсэн (`core_*`)

### core_user_invites

🔒🔒 · үүсгэсэн `20261013005_core_user_invites.sql`

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK NN |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| user_id | UUID | NN |  |
| token_hash | TEXT | NN |  |
| purpose | "CoreInvitePurpose" | NN |  |
| channel | "CoreInviteChannel" | NN |  |
| expires_at | TIMESTAMPTZ | NN |  |
| used_at | TIMESTAMPTZ |  |  |
| revoked_at | TIMESTAMPTZ |  |  |
| created_by | UUID |  |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |

Constraint: `FOREIGN KEY (tenant_id, user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE` · `CHECK (token_hash ~ '^[0-9a-f]{64}$')` · `CHECK (expires_at > created_at)`

Policy: `tenant_isolation_core_user_invites` (permissive ALL → app_user (camp_apply_tenant_rls))

Trigger: `trg_core_user_invites_updated_at`

### core_users

🔒🔒 · үүсгэсэн `0001_initial_schema.sql` · өөрчлөлт: +locale (`20261011004_core_users_locale.sql`), +phone (`20261013004_core_users_login.sql`), +username (`20261013004_core_users_login.sql`), +must_change_password (`20261013004_core_users_login.sql`)

| Багана | Төрөл | Шинж | FK |
|---|---|---|---|
| id | UUID | PK |  |
| tenant_id | UUID | NN | → tenants (cascade) |
| auth_id | UUID | NN UQ |  |
| email | TEXT | NN |  |
| full_name | TEXT |  |  |
| role | "UserRole" | NN |  |
| is_active | BOOLEAN | NN |  |
| created_at | TIMESTAMPTZ | NN |  |
| updated_at | TIMESTAMPTZ | NN |  |
| locale | TEXT | NN |  |
| phone | TEXT |  |  |
| username | TEXT |  |  |
| must_change_password | BOOLEAN | NN |  |

Constraint: `UNIQUE (tenant_id, email)` · `UNIQUE (tenant_id, id)` · `CHECK (phone IS NULL OR phone ~ '^[0-9]{8}$')` · `CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9._-]{1,63}$')`

Policy: `tenant_isolation_users_select` (permissive SELECT) · `tenant_isolation_users_insert` (permissive INSERT) · `tenant_isolation_users_update` (permissive UPDATE) · `tenant_isolation_users_delete` (permissive DELETE)

Trigger: `update_core_users_updated_at`

## Enum

| Enum | Утгууд | Migration |
|---|---|---|
| CampAssetCondition | GOOD, DAMAGED, WRITTEN_OFF | `20261009004_camp_assets_maintenance.sql` |
| CampAuditAction | CREATE, UPDATE, DEACTIVATE, IMPORT, TERMINATE, REHIRE | `20261011001_camp_audit_log.sql` |
| CampContractStatus | DRAFT, ACTIVE, TERMINATED | `20261009005_camp_contracts.sql` |
| CampContractUnit | TRIP, M3, TON, PERSON_DAY | `20261009005_camp_contracts.sql` |
| CampCostSource | HAUL, MEAL, MAINTENANCE_PART | `20261009006_camp_operations.sql` |
| CampDataImportSource | XLSX, GRID | `20261011002_camp_data_imports.sql` |
| CampDataImportStatus | PREVIEW, CONFIRMED, CANCELLED | `20261011002_camp_data_imports.sql` |
| CampDataImportType | EMPLOYEES, DEPARTMENTS, POSITIONS, FORMER_EMPLOYEES, BUILDING_TYPES, BUILDINGS, ROOMS, ROOM_ALLOCATIONS | `20261011002_camp_data_imports.sql` |
| CampEmployeeStatus | ACTIVE, INACTIVE, TERMINATED | `20261009002_camp_master.sql` |
| CampHaulStatus | DRAFT, SUBMITTED, APPROVED, REJECTED | `20261009006_camp_operations.sql` |
| CampHaulType | SEWAGE, WASTE | `20261009006_camp_operations.sql` |
| CampImportStatus | PREVIEW, CONFIRMED, CANCELLED | `20261009003_camp_attendance.sql` |
| CampMaintenancePriority | LOW, MEDIUM, HIGH, URGENT | `20261009004_camp_assets_maintenance.sql` |
| CampMaintenanceStatus | OPEN, IN_PROGRESS, DONE, CLOSED, CANCELLED | `20261009004_camp_assets_maintenance.sql` |
| CampMealOrderStatus | DRAFT, ORDERED, ACCEPTED, REJECTED | `20261009006_camp_operations.sql` |
| CampMealType | BREAKFAST, LUNCH, DINNER, NIGHT | `20261009003_camp_attendance.sql` |
| CampMovementDirection | ARRIVAL, DEPARTURE | `20261009003_camp_attendance.sql` |
| CampMovementKind | ROSTER, OFF_ROSTER | `20261009003_camp_attendance.sql` |
| CampOrgServiceType | CATERING, WASTE_TRANSPORT, SEWAGE_TRANSPORT, WASTE_DISPOSAL, SEWAGE_DISPOSAL, OTHER | `20261010002_camp_org_services_maintenance.sql` |
| CampOrgType | MAIN, SUBCONTRACTOR, CONTRACTOR | `20261009002_camp_master.sql` |
| CampPartSource | MINE_SUPPLIED, CATERING_PURCHASED | `20261009004_camp_assets_maintenance.sql` |
| CampPermissionSource | TEMPLATE, DIRECT | `20261013001_camp_user_permissions.sql` |
| CampRoleCode | CAMP_ADMIN, CAMP_MANAGER, CATERING_ADMIN, EMPLOYEE | `20261009001_camp_rbac.sql` |
| CampRoomStatus | ACTIVE, MAINTENANCE, INACTIVE | `20261009002_camp_master.sql` |
| CampServiceType | SEWAGE_TRANSPORT, SEWAGE_DISPOSAL, WASTE_TRANSPORT, WASTE_DISPOSAL, MEAL | `20261009005_camp_contracts.sql` |
| CampShiftAdjustmentReason | EARLY_ARRIVAL, SHIFT_CHANGE, OTHER | `20261009003_camp_attendance.sql` |
| CampShiftType | DAY, NIGHT | `20261009002_camp_master.sql` |
| CampTemplateScope | ALL_CAMPS, EMPLOYEE_CAMP | `20261013002_camp_position_role_templates.sql` |
| CampTerminationReason | RESIGNED, DISMISSED, CONTRACT_END, OTHER | `20261017002_camp_employees_termination.sql` |
| CampVolumeUnit | M3, TON | `20261009006_camp_operations.sql` |
| CoreInviteChannel | LINK, EMAIL | `20261013005_core_user_invites.sql` |
| CoreInvitePurpose | INVITE, RESET | `20261013005_core_user_invites.sql` |
| MrStatus | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED, PROVISIONALLY_APPROVED | `0004_add_native_enums.sql` |
| OutboxStatus | PENDING, PUBLISHED, FAILED, DEAD_LETTERED | `0004_add_native_enums.sql` |
| TierType | tier1, tier2, tier3 | `0004_add_native_enums.sql` |
| UserRole | requester, approver, admin, viewer, owner | `0004_add_native_enums.sql` |

## Функц (SQL)

| Функц | Аргумент | Сүүлд тодорхойлсон |
|---|---|---|
| `assert_tenant_context_set` |  | `0003_force_rls_hardening.sql` |
| `auth_guard.hook_password_verification_attempt` | event JSONB | `20261012006_auth_password_guard.sql` |
| `camp_apply_tenant_rls` | p_table regclass | `20261009001_camp_rbac.sql` |
| `camp_cost_entries_immutable` |  | `20261009006_camp_operations.sql` |
| `camp_employees_names` |  | `20261019002_hr_employee_names_phones.sql` |
| `camp_employees_sync_position_roles` |  | `20261013004_core_users_login.sql` |
| `camp_haul_records_guard` |  | `20261009006_camp_operations.sql` |
| `camp_maintenance_parts_protect` |  | `20261010002_camp_org_services_maintenance.sql` |
| `camp_maintenance_requests_protect` |  | `20261009004_camp_assets_maintenance.sql` |
| `camp_meal_order_lines_guard` |  | `20261009006_camp_operations.sql` |
| `camp_meal_orders_guard` |  | `20261009006_camp_operations.sql` |
| `camp_roles_protect_system` |  | `20261009001_camp_rbac.sql` |
| `camp_seed_default_roles` | p_tenant_id uuid | `20261017002_camp_employees_termination.sql` |
| `camp_stays_validate` |  | `20261009003_camp_attendance.sql` |
| `camp_tenant_exists` | p_tenant_id uuid | `20261009001_camp_rbac.sql` |
| `camp_tenants_after_insert` |  | `20261009001_camp_rbac.sql` |
| `camp_user_roles_apply_template` |  | `20261013001_camp_user_permissions.sql` |
| `cleanup_tenant_context` |  | `0003_force_rls_hardening.sql` |
| `clone_tables_to_schema` | p_schema_name TEXT, p_tenant_id UUID | `20260921004_schema_isolation.sql` |
| `current_tenant_id` |  | `20261010004_rls_app_user.sql` |
| `deprovision_tenant_schema` | p_tenant_id UUID | `20260921004_schema_isolation.sql` |
| `generate_mr_number` | p_tenant_id UUID | `0001_initial_schema.sql` |
| `provision_tenant_schema` | p_tenant_id UUID | `20260921004_schema_isolation.sql` |
| `update_updated_at_column` |  | `0001_initial_schema.sql` |
| `uuid_generate_v7` |  | `0006_sprint0_preflight.sql` |
