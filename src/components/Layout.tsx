import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  LayoutDashboard,
  Play,
  LogOut,
  ChevronRight,
  Users,
  FolderKey,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Executions', to: '/executions', icon: Play },
]

const adminNavigation = [
  { name: 'Users', to: '/admin/users', icon: Users },
  { name: 'Groups', to: '/admin/groups', icon: FolderKey },
]

export function Layout() {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="flex h-screen bg-qhub-cream-light">
      {/* Sidebar */}
      <aside className="w-60 bg-qhub-green text-white flex flex-col">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-qhub-green-light/30">
          <img src="/img/qualitahub_logo_white.png" alt="QualitaHub" className="h-7 mb-1.5" />
          <div className="text-[11px] text-qhub-cream-dark leading-tight">Agent AI Services</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-qhub-cream/70 hover:bg-qhub-green-light hover:text-white'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.name}</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-40" />
            </NavLink>
          ))}

          {user?.isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-qhub-cream-dark/50">
                  Administration
                </span>
              </div>
              {adminNavigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors',
                      isActive
                        ? 'bg-brand-500 text-white'
                        : 'text-qhub-cream/70 hover:bg-qhub-green-light hover:text-white'
                    )
                  }
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-40" />
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-qhub-green-light/30">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-medium uppercase">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-[11px] text-qhub-cream-dark/60 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-qhub-cream/50 hover:text-white hover:bg-qhub-green-light rounded transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
