import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span
          className="text-lg font-bold text-gray-900 cursor-pointer"
          onClick={() => navigate('/requisitions')}
        >
          S Project
        </span>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/approval-sla')} className="text-sm text-gray-600 hover:text-blue-600">SLA</button>
          <button onClick={() => navigate('/admin/workflow-definitions')} className="text-sm text-gray-600 hover:text-blue-600">Workflow</button>
          <button onClick={() => navigate('/admin/delegations')} className="text-sm text-gray-600 hover:text-blue-600">Delegation</button>
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Гарах
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
