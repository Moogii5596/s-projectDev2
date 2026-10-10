import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, inputCls } from '../components/ui'

/** /camp — кемп сонгох + байгууллагын түвшний удирдлага */
export default function CampHomePage() {
  const perms = useCampPermissions()
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })
  const [creating, setCreating] = useState(false)

  if (camps.isLoading || perms.isLoading) return <Loading />
  if (camps.isError) {
    const status = (camps.error as { response?: { status?: number } })?.response?.status
    if (status === 403) {
      return (
        <div>
          <PageHeader title="Кемп" />
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">
            Танд кемпийн эрх олгогдоогүй байна. Кемпийн админд хандана уу.
          </div>
        </div>
      )
    }
    return <ErrorBox error={camps.error} onRetry={() => camps.refetch()} />
  }

  const canMaster = perms.can(P.MASTER_MANAGE)
  const canRoles = perms.can(P.ROLES_MANAGE)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Кемп"
        subtitle="Кемпээ сонгоно уу"
        actions={canMaster && <Button onClick={() => setCreating(true)}>+ Кемп нэмэх</Button>}
      />

      {camps.data && camps.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {camps.data.map((c) => (
            <Link
              key={c.id}
              to={`/camp/${c.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{c.code}</span>
                <ActiveBadge active={c.isActive} />
              </div>
              <div className="mt-1 font-semibold text-gray-900">{c.name}</div>
              {c.location && <div className="text-sm text-gray-500 mt-0.5">{c.location}</div>}
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <Empty>Кемп бүртгэгдээгүй байна.{canMaster && ' "+ Кемп нэмэх" товчоор эхлүүлнэ үү.'}</Empty>
        </Card>
      )}

      <Card title="Байгууллагын түвшний тохиргоо">
        <ul className="text-sm space-y-2">
          <li>
            <Link to="/camp/admin/organizations" className="text-blue-600 hover:underline">
              Байгууллагууд
            </Link>
            <span className="text-gray-500"> — уурхай, туслан гүйцэтгэгч, катеринг, хог/бохир ус</span>
          </li>
          <li>
            <Link to="/camp/admin/asset-categories" className="text-blue-600 hover:underline">
              Хөрөнгийн ангилал
            </Link>
            <span className="text-gray-500"> — бүх кемпэд нийтлэг</span>
          </li>
          {canRoles && (
            <>
              <li>
                <Link to="/camp/admin/roles" className="text-blue-600 hover:underline">
                  Роль ба эрх
                </Link>
                <span className="text-gray-500"> — роль бүрийн эрхийн матриц</span>
              </li>
              <li>
                <Link to="/camp/admin/user-roles" className="text-blue-600 hover:underline">
                  Хэрэглэгчийн роль
                </Link>
                <span className="text-gray-500"> — хэрэглэгчид бүх кемпэд эсвэл тодорхой кемпэд роль оноох</span>
              </li>
            </>
          )}
        </ul>
      </Card>

      {creating && <CreateCampModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateCampModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const m = useCampMutation(
    () => campApi.createCamp({ code: code.trim(), name: name.trim(), location: location.trim() || null }),
    [campKeys.camps],
    onClose,
  )
  return (
    <Modal
      title="Кемп нэмэх"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!code.trim() || !name.trim()}>
            Хадгалах
          </Button>
        </>
      }
    >
      <Field label="Код" hint="Латин үсэг, тоо, . _ - (дараа өөрчлөгдөхгүй; засварын дугаарт орно: ZAS-{код}-…)">
        {(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />}
      </Field>
      <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
      <Field label="Байршил">
        {(id) => <input id={id} className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />}
      </Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
