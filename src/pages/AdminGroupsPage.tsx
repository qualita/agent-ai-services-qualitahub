import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Plus, Pencil, X, FolderKey, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupRecord, Agent } from '@/types'

export function AdminGroupsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<GroupRecord | null>(null)
  const queryClient = useQueryClient()

  const { data: groups = [], isLoading } = useQuery({
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
            <FolderKey className="w-5 h-5 text-slate-400" />
            <h1 className="text-xl font-semibold text-slate-800">Groups</h1>
          </div>
          <p className="text-sm text-slate-500">Manage access groups and agent permissions</p>
        </div>
        <button
          onClick={() => {
            setEditingGroup(null)
            setModalOpen(true)
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Group
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hay grupos</p>
            <p className="text-xs text-slate-400 mt-1">Crea grupos con el botón superior</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Agents</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Users</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((group) => (
                <tr key={group.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{group.name}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                    {group.description || '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {group.agents.map((a) => (
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
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{group.userCount}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full font-medium',
                        group.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {group.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditingGroup(group)
                        setModalOpen(true)
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                      title="Edit group"
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
        <GroupFormModal
          group={editingGroup}
          agents={agents}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
          }}
        />
      )}
    </div>
  )
}

function GroupFormModal({
  group,
  agents,
  onClose,
  onSaved,
}: {
  group: GroupRecord | null
  agents: Agent[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [isActive, setIsActive] = useState(group?.isActive ?? true)
  const [agentAccess, setAgentAccess] = useState<Record<number, 'FULL' | 'OWN'>>(
    () => {
      const map: Record<number, 'FULL' | 'OWN'> = {}
      if (group?.agents) {
        for (const a of group.agents) {
          map[a.agentId] = a.accessLevel
        }
      }
      return map
    }
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleAgent = (agentId: number) => {
    setAgentAccess((prev) => {
      if (prev[agentId]) {
        const next = { ...prev }
        delete next[agentId]
        return next
      }
      return { ...prev, [agentId]: 'FULL' }
    })
  }

  const setLevel = (agentId: number, level: 'FULL' | 'OWN') => {
    setAgentAccess((prev) => ({ ...prev, [agentId]: level }))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setError('')
    setSaving(true)
    try {
      const agentsList = Object.entries(agentAccess).map(([id, level]) => ({
        agentId: Number(id),
        accessLevel: level,
      }))

      if (group) {
        await api.updateGroup(group.id, { name, description, isActive })
        await api.updateGroupAgents(group.id, agentsList)
      } else {
        const created = await api.createGroup({ name, description, agents: agentsList })
        if (!created.id) throw new Error('Failed to create group')
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            {group ? 'Edit Group' : 'Create Group'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 resize-none"
            />
          </div>

          {group && (
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Agent Access
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {agents.map((agent) => {
                const selected = agentAccess[agent.agentId] !== undefined
                return (
                  <div key={agent.agentId} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAgent(agent.agentId)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-700 truncate">{agent.name}</span>
                    </label>
                    {selected && (
                      <select
                        value={agentAccess[agent.agentId]}
                        onChange={(e) => setLevel(agent.agentId, e.target.value as 'FULL' | 'OWN')}
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
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : group ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
