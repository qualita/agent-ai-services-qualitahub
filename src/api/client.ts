import type { Agent, AgentSummary, Execution, ExecutionDetail, DashboardStats, AuthUser, AppUserRecord, GroupRecord } from '@/types'

const API_BASE = '/api'

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (res.status === 401) {
    sessionStorage.removeItem('auth_user')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function fetchApiMutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    sessionStorage.removeItem('auth_user')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Error ${res.status}` }))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

function getAccessParams(): Record<string, string> {
  const stored = sessionStorage.getItem('auth_user')
  if (!stored) return {}
  try {
    const user = JSON.parse(stored) as AuthUser
    if (user.isAdmin) return {}
    if (!user.agentAccess?.length) return { agentIds: '0' }

    const fullIds = user.agentAccess.filter((a) => a.accessLevel === 'FULL').map((a) => a.agentId)
    const ownIds = user.agentAccess.filter((a) => a.accessLevel === 'OWN').map((a) => a.agentId)

    const params: Record<string, string> = {}
    if (fullIds.length > 0) params.fullAgentIds = fullIds.join(',')
    if (ownIds.length > 0) {
      params.ownAgentIds = ownIds.join(',')
      params.invokedBy = user.email
    }
    return params
  } catch {
    return {}
  }
}

function getAgentListParams(): Record<string, string> {
  const stored = sessionStorage.getItem('auth_user')
  if (!stored) return {}
  try {
    const user = JSON.parse(stored) as AuthUser
    if (user.isAdmin) return {}
    if (!user.agentAccess?.length) return { agentIds: '0' }
    const allIds = user.agentAccess.map((a) => a.agentId)
    return { agentIds: allIds.join(',') }
  } catch {
    return {}
  }
}

export const api = {
  getStats: (dateFrom?: string, dateTo?: string) => {
    const params: Record<string, string> = { ...getAccessParams() }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<DashboardStats>(`/dashboard/stats${qs}`)
  },
  getAgents: () => {
    const params = getAgentListParams()
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<Agent[]>(`/agents${qs}`)
  },
  getAllAgents: () => fetchApi<Agent[]>('/agents'),
  getAgentsSummary: () => {
    const params = getAccessParams()
    const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
    return fetchApi<AgentSummary[]>(`/agents-summary${qs}`)
  },
  getAgent: (id: string) => fetchApi<Agent>(`/agents/${id}`),
  getExecutions: (params?: Record<string, string | undefined>) => {
    const clean: Record<string, string> = {}
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) clean[k] = v
      }
    }
    const access = getAccessParams()
    Object.assign(clean, access)
    const qs = Object.keys(clean).length ? '?' + new URLSearchParams(clean).toString() : ''
    return fetchApi<{ items: Execution[]; total: number }>(`/executions${qs}`)
  },
  getExecution: (id: string) => fetchApi<ExecutionDetail>(`/executions/${id}`),
  getFileSasUrl: (blobPath: string, filename?: string, inline?: boolean) => {
    const params = new URLSearchParams({ path: blobPath })
    if (filename) params.set('filename', filename)
    if (inline) params.set('mode', 'inline')
    return fetchApi<{ url: string }>(`/files/sas?${params.toString()}`)
  },
  getFileContentUrl: (blobPath: string) => {
    const params = new URLSearchParams({ path: blobPath })
    return `${API_BASE}/files/content?${params.toString()}`
  },
  getFileDownloadUrl: (blobPath: string, filename: string) => {
    const params = new URLSearchParams({ path: blobPath, download: '1', filename })
    return `${API_BASE}/files/content?${params.toString()}`
  },
  getFileContentText: async (blobPath: string): Promise<string> => {
    const url = `${API_BASE}/files/content?${new URLSearchParams({ path: blobPath })}`
    const res = await fetch(url)
    if (res.status === 401) {
      sessionStorage.removeItem('auth_user')
      window.location.href = '/login'
      throw new Error('Session expired')
    }
    if (!res.ok) throw new Error(`File fetch failed: ${res.status}`)
    return res.text()
  },
  getFileContentBuffer: async (blobPath: string): Promise<ArrayBuffer> => {
    const url = `${API_BASE}/files/content?${new URLSearchParams({ path: blobPath })}`
    const res = await fetch(url)
    if (res.status === 401) {
      sessionStorage.removeItem('auth_user')
      window.location.href = '/login'
      throw new Error('Session expired')
    }
    if (!res.ok) throw new Error(`File fetch failed: ${res.status}`)
    return res.arrayBuffer()
  },

  // Auth
  getMe: () => fetchApi<AuthUser>('/auth/me'),

  // Admin - Users
  getUsers: () => fetchApi<AppUserRecord[]>('/mgmt/users'),
  createUser: (data: { email: string; emailAlias?: string; name: string; isAdmin?: boolean; groupIds?: number[] }) =>
    fetchApiMutate<{ id: number }>('/mgmt/users', 'POST', data),
  updateUser: (id: number, data: { name?: string; email?: string; emailAlias?: string; isActive?: boolean; isAdmin?: boolean }) =>
    fetchApiMutate<{ success: boolean }>(`/mgmt/users/${id}`, 'PUT', data),
  updateUserGroups: (id: number, groupIds: number[]) =>
    fetchApiMutate<{ success: boolean }>(`/mgmt/users/${id}/groups`, 'PUT', { groupIds }),
  updateUserAgents: (id: number, agents: { agentId: number; accessLevel: string }[]) =>
    fetchApiMutate<{ success: boolean }>(`/mgmt/users/${id}/agents`, 'PUT', { agents }),

  // Admin - Groups
  getGroups: () => fetchApi<GroupRecord[]>('/mgmt/groups'),
  createGroup: (data: { name: string; description?: string; agents?: { agentId: number; accessLevel: string }[] }) =>
    fetchApiMutate<{ id: number }>('/mgmt/groups', 'POST', data),
  updateGroup: (id: number, data: { name?: string; description?: string; isActive?: boolean }) =>
    fetchApiMutate<{ success: boolean }>(`/mgmt/groups/${id}`, 'PUT', data),
  updateGroupAgents: (id: number, agents: { agentId: number; accessLevel: string }[]) =>
    fetchApiMutate<{ success: boolean }>(`/mgmt/groups/${id}/agents`, 'PUT', { agents }),
}
