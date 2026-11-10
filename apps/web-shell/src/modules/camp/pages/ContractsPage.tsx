import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import { contractApi, type ContractInput } from '../api/contract-api'
import type { ContractStatus } from '../api/contract-types'
import { Button, Badge, Card, Empty, ErrorBox, Loading, Modal, NoAccess, PageHeader, Table, td } from '../../../core/ui'
import ContractForm from '../components/contracts/ContractForm'
import { useAppMutation } from '../../../core/useAppMutation'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { contractStatusTone } from '../lib/contract'
import { todayUb } from '../../../core/dates'

const STATUSES: ContractStatus[] = ['DRAFT', 'ACTIVE', 'TERMINATED']
const contractListKey = (campId: string) => ['camp', campId, 'contracts'] as const

export default function ContractsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const permissions = useAppPermissions(campId)
  const [status, setStatus] = useState<ContractStatus | ''>('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ContractInput>(() => ({
    contractNo: '',
    title: '',
    organizationId: '',
    customerOrganizationId: null,
    startDate: todayUb(),
    endDate: null,
    currency: 'MNT',
    paymentCurrency: 'MNT',
    vatRate: '10',
    ratePolicy: 'NONE',
    fixedRate: null,
    paymentTerms: [],
    note: null,
  }))
  const canManage = permissions.can('camp.contract.manage')
  const contracts = useQuery({
    queryKey: [...contractListKey(campId), status],
    queryFn: () => contractApi.list(campId, status ? { status } : {}),
    enabled: !!campId && canManage,
  })
  const organizations = useQuery({
    queryKey: [...campKeys.organizations, 'active'],
    queryFn: () => campApi.organizations({ activeOnly: true }),
    enabled: !!creating && canManage,
  })
  const create = useAppMutation(
    () => contractApi.create(campId, {
      ...form,
      contractNo: form.contractNo.trim(),
      title: form.title.trim(),
      note: form.note?.trim() || null,
    }),
    [contractListKey(campId)],
    () => setCreating(false),
  )

  if (permissions.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.ct.title')} />

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('camp.ct.title')}
        actions={<Button onClick={() => setCreating(true)}>{t('camp.ct.new_contract')}</Button>}
      />
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link className="text-blue-700 hover:underline" to="/settings/contract-catalog">{t('camp.ct.catalog_title')}</Link>
        <Link className="text-blue-700 hover:underline" to="/settings/exchange-rates">{t('camp.ct.exchange_rates_title')}</Link>
      </nav>
      <Card>
        <div className="mb-3 max-w-xs">
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="contract-status">{t('camp.ct.filter_status')}</label>
          <select id="contract-status" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | '')}>
            <option value="">{t('camp.common.all')}</option>
            {STATUSES.map((item) => <option key={item} value={item}>{t(`camp.ct.status.${item}`)}</option>)}
          </select>
        </div>
        {contracts.isLoading && <Loading />}
        <ErrorBox error={contracts.error} onRetry={() => contracts.refetch()} />
        {contracts.data && contracts.data.length === 0 && <Empty>{t('camp.ct.no_contracts')}</Empty>}
        {contracts.data && contracts.data.length > 0 && (
          <Table head={[t('camp.ct.contract_no'), t('camp.ct.title'), t('camp.ct.organization'), t('camp.ct.date_range'), t('camp.ct.items'), t('camp.common.status')]}>
            {contracts.data.map((contract) => (
              <tr key={contract.id}>
                <td className={td}>
                  <Link className="font-medium text-blue-700 hover:underline" to={`/camp/${campId}/contracts/${contract.id}`}>
                    {contract.contractNo}
                  </Link>
                </td>
                <td className={td}>{contract.title}</td>
                <td className={td}>{contract.organizationName}</td>
                <td className={td}>{contract.startDate} – {contract.endDate ?? t('camp.ct.no_end_date')}</td>
                <td className={`${td} text-right`}>{contract.itemCount}</td>
                <td className={td}><Badge tone={contractStatusTone(contract.status)}>{t(`camp.ct.status.${contract.status}`)}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && (
        <Modal title={t('camp.ct.new_contract')} wide onClose={() => setCreating(false)}>
          {organizations.isLoading && <Loading />}
          <ErrorBox error={organizations.error} onRetry={() => organizations.refetch()} />
          {organizations.data && (
            <ContractForm
              value={form}
              onChange={setForm}
              organizations={organizations.data}
              saving={create.isPending}
              error={create.error}
              onCancel={() => setCreating(false)}
              onSave={() => create.mutate(undefined)}
            />
          )}
        </Modal>
      )}
    </div>
  )
}
