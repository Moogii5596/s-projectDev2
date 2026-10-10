import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMe } from '../../hooks/useMe'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../camp/components/ui'
import { createVendor, listVendors, updateVendor, type Vendor } from './api'

/** Phase 6.0.3 — Нийлүүлэгчид (Vendor-lite) */
export default function VendorsPage() {
  const { canWrite } = useMe()
  const qc = useQueryClient()
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null)

  const list = useQuery({ queryKey: ['vendors', { activeOnly }], queryFn: () => listVendors(activeOnly) })

  const toggle = useMutation({
    mutationFn: (v: Vendor) => updateVendor(v.id, { isActive: !v.isActive }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vendors'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  return (
    <div>
      <PageHeader title="Нийлүүлэгчид" actions={canWrite && <Button onClick={() => setEditing('new')}>+ Шинэ нийлүүлэгч</Button>} />
      <Card
        title="Жагсаалт"
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Зөвхөн идэвхтэй
          </label>
        }
      >
        <ErrorBox error={toggle.error} />
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <Empty>{activeOnly ? 'Идэвхтэй нийлүүлэгч алга' : 'Одоогоор нийлүүлэгч бүртгэгдээгүй'}</Empty>
        ) : (
          <Table head={['Нэр', 'Регистр', 'Төлөв', ...(canWrite ? [''] : [])]}>
            {list.data.map((v) => (
              <tr key={v.id} data-testid={`vendor-row-${v.name}`}>
                <td className={`${td} text-gray-900`}>{v.name}</td>
                <td className={`${td} text-gray-600`}>{v.regNumber ?? '—'}</td>
                <td className={td}>
                  <ActiveBadge active={v.isActive} />
                </td>
                {canWrite && (
                  <td className={`${td} text-right space-x-3 whitespace-nowrap`}>
                    <Button variant="ghost" onClick={() => setEditing(v)}>
                      Засах
                    </Button>
                    <Button variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(v)}>
                      {v.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <VendorModal vendor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function VendorModal({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(vendor?.name ?? '')
  const [regNumber, setRegNumber] = useState(vendor?.regNumber ?? '')

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), regNumber: regNumber.trim() }
      return vendor ? updateVendor(vendor.id, body) : createVendor(body.regNumber ? body : { name: body.name })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vendors'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) save.mutate()
  }

  return (
    <Modal title={vendor ? 'Нийлүүлэгч засах' : 'Шинэ нийлүүлэгч'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Нэр">{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={inputCls} required />}</Field>
        <Field label="Регистрийн дугаар" hint="Заавал биш">
          {(id) => <input id={id} value={regNumber} onChange={(e) => setRegNumber(e.target.value)} maxLength={50} className={inputCls} />}
        </Field>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
            Хадгалах
          </Button>
        </div>
      </form>
    </Modal>
  )
}
