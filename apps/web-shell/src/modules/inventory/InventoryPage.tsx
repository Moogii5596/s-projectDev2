import { useState, type FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe } from '../../hooks/useMe'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../../core/ui'
import { adjustInventoryItem, createInventoryItem, listInventory, type InventoryItem } from './api'
import { applyDelta, formatQuantity, parseDelta, parseQuantity } from './lib/quantity'

/** Phase 6.0.2 — Бараа материалын үлдэгдэл (Inventory-lite) */
export default function InventoryPage() {
  const { canWrite } = useMe()
  const [lowStock, setLowStock] = useState(false)
  const [creating, setCreating] = useState(false)
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null)

  const list = useInfiniteQuery({
    queryKey: ['inventory', 'items', { lowStock }],
    queryFn: ({ pageParam }) => listInventory({ cursor: pageParam, lowStock }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : null),
  })
  const items = list.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div>
      <PageHeader
        title="Бараа материал"
        subtitle="Үлдэгдэл, доод хэмжээ (≤ бол анхааруулна)"
        actions={canWrite && <Button onClick={() => setCreating(true)}>+ Шинэ бараа</Button>}
      />

      <Card
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
            Зөвхөн бага үлдэгдэлтэй
          </label>
        }
        title="Жагсаалт"
      >
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <Empty>{lowStock ? 'Бага үлдэгдэлтэй бараа алга' : 'Одоогоор бараа бүртгэгдээгүй'}</Empty>
        ) : (
          <>
            <Table head={['SKU', 'Нэр', 'Үлдэгдэл', 'Доод хэмжээ', '', ...(canWrite ? [''] : [])]}>
              {items.map((it) => (
                <tr key={it.id} data-testid={`inv-row-${it.sku}`}>
                  <td className={`${td} font-mono text-xs text-gray-600 whitespace-nowrap`}>{it.sku}</td>
                  <td className={`${td} text-gray-900`}>{it.name}</td>
                  <td className={`${td} tabular-nums`}>
                    {formatQuantity(it.quantity)} <span className="text-gray-400">{it.unit}</span>
                  </td>
                  <td className={`${td} tabular-nums text-gray-500`}>{formatQuantity(it.minThreshold)}</td>
                  <td className={td}>{it.lowStock && <Badge tone="yellow">⚠ Бага</Badge>}</td>
                  {canWrite && (
                    <td className={`${td} text-right`}>
                      <Button variant="ghost" onClick={() => setAdjusting(it)}>
                        Тохируулах
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </Table>
            {list.hasNextPage && (
              <div className="pt-3 text-center">
                <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                  Цааш ачаалах
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {creating && <CreateItemModal onClose={() => setCreating(false)} />}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  )
}

function CreateItemModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [quantity, setQuantity] = useState('')
  const [minThreshold, setMinThreshold] = useState('')
  const qty = parseQuantity(quantity)
  const min = parseQuantity(minThreshold)
  const valid = sku.trim() !== '' && name.trim() !== '' && qty.ok && min.ok

  const create = useMutation({
    mutationFn: () =>
      createInventoryItem({
        sku: sku.trim(),
        name: name.trim(),
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        quantity: qty.ok ? Number(qty.value) : 0,
        minThreshold: min.ok ? Number(min.value) : 0,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['inventory'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) create.mutate()
  }

  return (
    <Modal title="Шинэ бараа" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU">{(id) => <input id={id} value={sku} onChange={(e) => setSku(e.target.value)} maxLength={100} className={inputCls} required />}</Field>
          <Field label="Нэгж" hint="Хоосон бол EA">
            {(id) => <input id={id} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} className={inputCls} />}
          </Field>
        </div>
        <Field label="Нэр">{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={inputCls} required />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Эхний үлдэгдэл" error={qty.ok ? null : qty.error}>
            {(id) => <input id={id} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />}
          </Field>
          <Field label="Доод хэмжээ" error={min.ok ? null : min.error}>
            {(id) => <input id={id} value={minThreshold} onChange={(e) => setMinThreshold(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />}
          </Field>
        </div>
        <ErrorBox error={create.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" disabled={!valid} loading={create.isPending}>
            Хадгалах
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AdjustModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient()
  const [delta, setDelta] = useState('')
  const parsed = parseDelta(delta)
  const preview = parsed.ok ? applyDelta(item.quantity, parsed.value) : null
  const error = delta.trim() === '' ? null : !parsed.ok ? parsed.error : preview?.negative ? `Үлдэгдэл хүрэлцэхгүй (одоо ${formatQuantity(item.quantity)})` : null

  const adjust = useMutation({
    mutationFn: () => adjustInventoryItem(item.id, Number(parsed.ok ? parsed.value : 0)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['inventory'] })
      await qc.invalidateQueries({ queryKey: ['reports'] })
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (parsed.ok && !preview?.negative) adjust.mutate()
  }

  return (
    <Modal title={`Үлдэгдэл тохируулах — ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">
          Одоо: <span className="font-medium tabular-nums">{formatQuantity(item.quantity)}</span> {item.unit}
        </p>
        <Field label="Өөрчлөлт (+ орлого, − зарлага)" error={error}>
          {(id) => <input id={id} value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="decimal" placeholder="жнь 10 эсвэл -2" className={inputCls} autoFocus />}
        </Field>
        {preview && !preview.negative && (
          <p className="text-sm text-gray-600">
            Шинэ үлдэгдэл: <span className="font-medium tabular-nums">{formatQuantity(preview.next)}</span> {item.unit}
          </p>
        )}
        <ErrorBox error={adjust.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" disabled={!parsed.ok || !!preview?.negative} loading={adjust.isPending}>
            Хадгалах
          </Button>
        </div>
      </form>
    </Modal>
  )
}
