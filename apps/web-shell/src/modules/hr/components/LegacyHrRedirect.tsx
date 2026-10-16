import { Navigate, useLocation, useParams } from 'react-router-dom'
import { type LegacyCampSection, legacyCampToHr } from '../lib/hr-sections'

/** v0.2.2 H2: хуучин `/camp/:campId/<section>` хаяг → `/hr/:campId/<section>` (query хэвээр) */
export default function LegacyHrRedirect({ section }: { section: LegacyCampSection }) {
  const { campId = '' } = useParams()
  const { search } = useLocation()
  return <Navigate to={legacyCampToHr(campId, section, search)} replace />
}
