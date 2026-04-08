import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  LayoutDashboard,
  Play,
  LogOut,
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
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-[260px] bg-gray-950 text-white flex flex-col border-r border-white/5">
        {/* Brand */}
        <div className="px-5 py-5">
          <img src="/img/unikal_logo_white.png" alt="Unikal" className="h-6 mb-2 opacity-90" />
          <div className="text-[11px] text-slate-400 font-medium tracking-wide">Agent AI Services</div>
        </div>

        <div className="mx-4 mb-3 border-t border-white/[0.06]" />

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                )
              }
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span>{item.name}</span>
            </NavLink>
          ))}

          {user?.isAdmin && (
            <>
              <div className="pt-5 pb-2 px-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Administration
                </span>
              </div>
              {adminNavigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20'
                        : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                    )
                  }
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="px-3 py-4">
          <div className="mx-1 mb-3 border-t border-white/[0.06]" />
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xs font-semibold uppercase shadow-lg shadow-brand-600/20">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-slate-200">{user?.name}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-500 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
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
