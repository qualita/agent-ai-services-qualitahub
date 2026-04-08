import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Plus, Pencil, X, Users, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppUserRecord, GroupRecord, Agent } from '@/types'

export function AdminUsersPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUserRecord | null>(null)
  const queryClient = useQueryClient()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.getUsers,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: api.getGroups,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['all-agents'],
    queryFn: api.getAllAgents,
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-slate-400" />
            <h1 className="text-xl font-semibold text-slate-800">Users</h1>
          </div>
          <p className="text-sm text-slate-500">Manage user accounts, group memberships, and direct agent access</p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null)
            setModalOpen(true)
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hay usuarios</p>
            <p className="text-xs text-slate-400 mt-1">Añade usuarios con el botón superior</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Groups</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Direct Access</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-center">
                    {user.isAdmin ? (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">
                        Admin
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full font-medium">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.groups.map((g) => (
                        <span
                          key={g.id}
                          className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full font-medium"
                        >
                          {g.name}
                        </span>
                      ))}
                      {user.groups.length === 0 && (
                        <span className="text-xs text-slate-400">{'\u2014'}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.directAgents.map((a) => (
                        <span
                          key={a.agentId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                        >
                          {a.agentName}
                          <span
                            className={cn(
                              'px-1 py-px text-[10px] rounded font-medium',
                              a.accessLevel === 'FULL'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            )}
                          >
                            {a.accessLevel}
                          </span>
                        </span>
                      ))}
                      {user.directAgents.length === 0 && (
                        <span className="text-xs text-slate-400">{'\u2014'}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full font-medium',
                        user.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditingUser(user)
                        setModalOpen(true)
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                      title="Edit user"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <UserFormModal
          user={editingUser}
          groups={groups}
          agents={agents}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['admin-users'] })
          }}
        />
      )}
    </div>
  )
}

function UserFormModal({
  user,
  groups,
  agents,
  onClose,
  onSaved,
}: {
  user: AppUserRecord | null
  groups: GroupRecord[]
  agents: Agent[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false)
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(
    user?.groups.map((g) => g.id) || []
  )
  const [directAgentAccess, setDirectAgentAccess] = useState<Record<number, 'FULL' | 'OWN'>>(
    () => {
      const map: Record<number, 'FULL' | 'OWN'> = {}
      if (user?.directAgents) {
        for (const a of user.directAgents) {
          map[a.agentId] = a.accessLevel
        }
      }
      return map
    }
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'groups' | 'agents'>('info')

  const toggleDirectAgent = (agentId: number) => {
    setDirectAgentAccess((prev) => {
      if (prev[agentId]) {
        const next = { ...prev }
        delete next[agentId]
        return next
      }
      return { ...prev, [agentId]: 'FULL' }
    })
  }

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required')
      return
    }

    setError('')
    setSaving(true)
    try {
      if (user) {
        await api.updateUser(user.id, {
          name,
          email,
          isActive,
          isAdmin,
        })
        await api.updateUserGroups(user.id, selectedGroupIds)
        const agentsList = Object.entries(directAgentAccess).map(([id, level]) => ({
          agentId: Number(id),
          accessLevel: level,
        }))
        await api.updateUserAgents(user.id, agentsList)
      } else {
        const created = await api.createUser({
          email,
          name,
          isAdmin,
          groupIds: selectedGroupIds,
        })
        if (!created.id) throw new Error('Failed to create user')
        // Save direct agents for new user
        const agentsList = Object.entries(directAgentAccess).map(([id, level]) => ({
          agentId: Number(id),
          accessLevel: level,
        }))
        if (agentsList.length > 0) {
          await api.updateUserAgents(created.id, agentsList)
        }
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            {user ? 'Edit User' : 'Create User'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {(['info', 'groups', 'agents'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {tab === 'info' ? 'General' : tab === 'groups' ? 'Groups' : 'Direct Access'}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 space-y-4 min-h-[280px]">
          {activeTab === 'info' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre.apellido@unikal.tech"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />
                <p className="text-xs text-slate-400 mt-1">El usuario accederá con esta cuenta de Microsoft (Entra ID)</p>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Administrator</span>
                </label>
                {user && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Active</span>
                  </label>
                )}
              </div>

              {isAdmin && (
                <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                  Administrators have full access to all agents and all executions.
                </div>
              )}
            </>
          )}

          {activeTab === 'groups' && (
            <div>
              <p className="text-xs text-slate-500 mb-3">
                Assign user to groups. The user will inherit agent access from these groups.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {groups
                  .filter((g) => g.isActive)
                  .map((group) => (
                    <label key={group.id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroupIds([...selectedGroupIds, group.id])
                          } else {
                            setSelectedGroupIds(selectedGroupIds.filter((id) => id !== group.id))
                          }
                        }}
                        className="rounded border-slate-300 mt-0.5"
                      />
                      <div>
                        <span className="text-sm text-slate-700">{group.name}</span>
                        {group.agents.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {group.agents.map((a) => (
                              <span key={a.agentId} className="inline-flex items-center gap-1 px-1.5 py-px bg-slate-50 text-slate-500 text-[10px] rounded">
                                {a.agentName}
                                <span className={cn(
                                  'font-medium',
                                  a.accessLevel === 'FULL' ? 'text-emerald-600' : 'text-amber-600'
                                )}>
                                  {a.accessLevel}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                {groups.filter((g) => g.isActive).length === 0 && (
                  <p className="text-sm text-slate-400">No active groups available</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div>
              <p className="text-xs text-slate-500 mb-3">
                Assign direct agent access to this user, independent of group membership.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {agents.map((agent) => {
                  const selected = directAgentAccess[agent.agentId] !== undefined
                  return (
                    <div key={agent.agentId} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDirectAgent(agent.agentId)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700 truncate">{agent.name}</span>
                      </label>
                      {selected && (
                        <select
                          value={directAgentAccess[agent.agentId]}
                          onChange={(e) =>
                            setDirectAgentAccess((prev) => ({
                              ...prev,
                              [agent.agentId]: e.target.value as 'FULL' | 'OWN',
                            }))
                          }
                          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                        >
                          <option value="FULL">Full</option>
                          <option value="OWN">Own only</option>
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Full: all executions. Own only: only executions invoked by the user.
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !email.trim()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : user ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}
