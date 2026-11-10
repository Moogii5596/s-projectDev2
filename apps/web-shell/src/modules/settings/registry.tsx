import type { ComponentType } from 'react'
import {
  AssetCategoriesPage,
  CatalogPage,
  ContractCatalogPage,
  ExchangeRatesPage,
  OrganizationsPage,
  RolesPage,
  TranslationsPage,
  UserRolesPage,
} from './camp-settings.bridge'
import SecurityPolicyPage from './SecurityPolicyPage'
import TenantProfilePage from './TenantProfilePage'
import ModulesPage from './ModulesPage'
import CalendarsPage from './CalendarsPage'
import ApprovalFlowsPage from './ApprovalFlowsPage'
import SitesPage from './SitesPage'
import AttachmentPatternsPage from './AttachmentPatternsPage'
import { SETTINGS_SECTIONS, type SettingsSection } from '../../lib/settings-registry'

const BuildingTypesPage = () => <CatalogPage kind="building-types" />

const COMPONENTS: Record<SettingsSection, ComponentType> = {
  profile: TenantProfilePage,
  security: SecurityPolicyPage,
  modules: ModulesPage,
  calendars: CalendarsPage,
  'approval-flows': ApprovalFlowsPage,
  sites: SitesPage,
  'attachment-patterns': AttachmentPatternsPage,
  roles: RolesPage,
  'user-roles': UserRolesPage,
  organizations: OrganizationsPage,
  'contract-catalog': ContractCatalogPage,
  'exchange-rates': ExchangeRatesPage,
  'building-types': BuildingTypesPage,
  'asset-categories': AssetCategoriesPage,
  translations: TranslationsPage,
}

export const SETTINGS_SECTION_REGISTRY = SETTINGS_SECTIONS.map((section) => ({ ...section, component: COMPONENTS[section.key] }))
