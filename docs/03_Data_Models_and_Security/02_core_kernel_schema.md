# Core Kernel Platform DB Schema Spec

**Document ID:** SEC-02  
**Project:** S Project  
**Location:** `03_Data_Models_and_Security/02_core_kernel_schema.md`  
**Status:** Approved Technical Architecture  

---

## 1. Ерөнхий Бүтэц

Core Kernel бааз нь зөвхөн платформын хэмжээний Auth, Tenant Resolution, болон Module Registry мэдээллийг хадгална (Zero Business Logic).

---

## 2. Core Kernel DDL Скрипт

```sql
-- 1. Байгууллагууд (Tenants)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    slug VARCHAR(64) NOT NULL UNIQUE, -- subdomain.s-project.cloud
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(16) NOT NULL DEFAULT 'TIER_1', -- 'TIER_1', 'TIER_2', 'TIER_3'
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUSPENDED', 'ARCHIVED'
    connection_uri TEXT, -- Tier 2/3 dedicated database URI (AES-256 шифрлэгдсэн)
    storage_quota_mb INT NOT NULL DEFAULT 5120,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_tenant_tier CHECK (tier IN ('TIER_1', 'TIER_2', 'TIER_3')),
    CONSTRAINT chk_tenant_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);

-- 2. Хэрэглэгчид (Unified Users)
CREATE TABLE core_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- auth_id: Supabase Auth UUID (auth.users.id) — Supabase authentication-г ашиглах тул
    -- password_hash биш; нэвтрэлтийг Supabase Auth удирдана
    auth_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'MEMBER', -- 'OWNER', 'ADMIN', 'MEMBER'
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'BLOCKED'
    mfa_secret VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_user_email UNIQUE (tenant_id, email),
    -- auth_id нь tenant дотор давтагдахгүй (Supabase Auth UUID unique per user globally)
    CONSTRAINT uq_tenant_auth_id UNIQUE (tenant_id, auth_id),
    CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
);

-- 3. Суулгасан Модулиуд ба Төлөв (Module Lifecycle Registry)
CREATE TABLE installed_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_id VARCHAR(64) NOT NULL, -- 'material-requisition', 'inventory-base'
    version VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'INSTALLED', -- 'INSTALLED', 'ACTIVE', 'DRAINING', 'SUSPENDED'
    drain_started_at TIMESTAMPTZ,
    manifest_snapshot JSONB NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_module UNIQUE (tenant_id, module_id),
    CONSTRAINT chk_module_lifecycle_status CHECK (
        status IN ('INSTALLED', 'ACTIVE', 'DRAINING', 'SUSPENDED')
    )
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_core_users_tenant_email ON core_users(tenant_id, email);
CREATE INDEX idx_installed_modules_tenant_lookup ON installed_modules(tenant_id, status);