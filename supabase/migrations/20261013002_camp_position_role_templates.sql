-- ============================================================
-- v0.2.2 Блок 1 — Албан тушаал → эрхийн загвар (ADR-003 §2.4, D-02) (2026-10-12)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.2
-- D-02: загвар = одоогийн camp_roles (+ camp_role_permissions). Албан тушаалд нэг буюу хэд хэдэн роль-загвар.
--   scope ALL_CAMPS     → олголт camp_id = NULL (бүх кемп)
--   scope EMPLOYEE_CAMP → олголт camp_id = ажилтны өөрийн кемп
-- Ажилтанд албан тушаал олгоход загвар хуулах нь Блок 2-т (ажилтан ↔ хэрэглэгчийн холбоос).
-- RULE-15: CampRoleCode-д EMPLOYEE нэмэх (ADD VALUE) энд; утгыг ашиглах seed нь 20261013003-т (нэг transaction-д ашиглах боломжгүй).
--
-- Rollback: DROP TABLE camp_position_role_templates; DROP TYPE "CampTemplateScope";
--           (enum утга EMPLOYEE-г PostgreSQL устгадаггүй — хор хөнөөлгүй үлдэнэ)
-- ============================================================

ALTER TYPE "CampRoleCode" ADD VALUE IF NOT EXISTS 'EMPLOYEE';

CREATE TYPE "CampTemplateScope" AS ENUM ('ALL_CAMPS', 'EMPLOYEE_CAMP');

CREATE TABLE camp_position_role_templates (
  tenant_id    UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position_id  UUID                NOT NULL,
  role_id      UUID                NOT NULL,
  scope        "CampTemplateScope" NOT NULL DEFAULT 'EMPLOYEE_CAMP',
  created_at   TIMESTAMPTZ         NOT NULL DEFAULT clock_timestamp(),
  updated_at   TIMESTAMPTZ         NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_camp_position_role_templates PRIMARY KEY (position_id, role_id),
  CONSTRAINT fk_camp_position_role_templates_position FOREIGN KEY (tenant_id, position_id)
    REFERENCES camp_positions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_position_role_templates_role FOREIGN KEY (tenant_id, role_id)
    REFERENCES camp_roles (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_position_role_templates_tenant ON camp_position_role_templates (tenant_id, position_id);

SELECT camp_apply_tenant_rls('camp_position_role_templates');
