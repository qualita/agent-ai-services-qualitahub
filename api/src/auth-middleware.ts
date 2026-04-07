import { HttpRequest, HttpResponseInit } from '@azure/functions'
import { query, TYPES } from './db.js'

/* ── Types ──────────────────────────────────────────────── */

export interface AuthUser {
  id: number
  email: string
  name: string
  isAdmin: boolean
  agentAccess: { agentId: number; accessLevel: string }[]
}

/* ── Helpers ─────────────────────────────────────────────── */

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/**
 * Decode the auth principal header.
 *
 * In production SWA with Entra ID, use x-ms-client-principal (injected by SWA).
 * In simulated auth mode, use x-app-auth-principal (custom header, not stripped by SWA).
 *
 * Format (base64-encoded JSON):
 *   { identityProvider, userId, userDetails, userRoles }
 *   where userDetails is the user email.
 */
function decodePrincipal(req: HttpRequest): { email: string } | null {
  const header = req.headers.get('x-ms-client-principal') ?? req.headers.get('x-app-auth-principal')
  if (!header) return null
  try {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
    // SWA format uses userDetails for the email/name claim
    const email: string | undefined = decoded.userDetails ?? decoded.email
    if (!email) return null
    return { email: email.toLowerCase() }
  } catch {
    return null
  }
}

/**
 * Resolve the authenticated user from the request header.
 * Queries AppUser + groups + agent access.
 */
export async function resolveUser(req: HttpRequest): Promise<AuthUser | null> {
  const principal = decodePrincipal(req)
  if (!principal) return null

  const users = await query(
    `SELECT Id, Email, Name, IsAdmin FROM AppUser WHERE Email = @email AND IsActive = 1`,
    [{ name: 'email', type: TYPES.NVarChar, value: principal.email }]
  )
  if (users.length === 0) return null

  const user = users[0]
  const isAdmin = user.IsAdmin === true

  let agentAccess: { agentId: number; accessLevel: string }[] = []
  if (!isAdmin) {
    const accessRows = await query(
      `SELECT AgentId, AccessLevel FROM (
         SELECT ga.AgentId, ga.AccessLevel
         FROM GroupAgent ga
         JOIN UserGroup ug ON ga.GroupId = ug.GroupId
         WHERE ug.UserId = @userId
         UNION ALL
         SELECT ua.AgentId, ua.AccessLevel
         FROM UserAgent ua
         WHERE ua.UserId = @userId
       ) allAccess`,
      [{ name: 'userId', type: TYPES.BigInt, value: user.Id }]
    )

    const accessMap = new Map<number, string>()
    for (const r of accessRows) {
      const aid = r.AgentId as number
      const lvl = r.AccessLevel as string
      const current = accessMap.get(aid)
      if (!current || lvl === 'FULL') {
        accessMap.set(aid, lvl)
      }
    }
    agentAccess = Array.from(accessMap.entries()).map(([agentId, accessLevel]) => ({
      agentId,
      accessLevel,
    }))
  }

  return {
    id: user.Id as number,
    email: user.Email as string,
    name: user.Name as string,
    isAdmin,
    agentAccess,
  }
}

/* ── Guards ──────────────────────────────────────────────── */

/** Require any authenticated user. Returns AuthUser or 401 response. */
export async function requireAuth(req: HttpRequest): Promise<AuthUser | HttpResponseInit> {
  const user = await resolveUser(req)
  if (!user) return json({ error: 'Authentication required' }, 401)
  return user
}

/** Require an admin user. Returns AuthUser or 401/403 response. */
export async function requireAdmin(req: HttpRequest): Promise<AuthUser | HttpResponseInit> {
  const user = await resolveUser(req)
  if (!user) return json({ error: 'Authentication required' }, 401)
  if (!user.isAdmin) return json({ error: 'Admin access required' }, 403)
  return user
}

/** Type guard to distinguish HttpResponseInit from AuthUser */
export function isAuthResponse(v: AuthUser | HttpResponseInit): v is HttpResponseInit {
  return 'status' in v && typeof (v as HttpResponseInit).status === 'number'
}

/* ── Visibility helpers (server-side, replaces query-param approach) ── */

export interface VisibilityFilter {
  where: string
  params: { name: string; type: unknown; value: unknown }[]
}

/**
 * Build visibility WHERE clause from the authenticated user's permissions.
 * Admins see everything. Non-admins are filtered by agent access.
 */
export function buildUserVisibilityFilter(user: AuthUser): VisibilityFilter {
  if (user.isAdmin) return { where: '', params: [] }

  if (user.agentAccess.length === 0) {
    // No access to any agent — return impossible condition
    return { where: ' AND 1=0', params: [] }
  }

  const fullIds = user.agentAccess.filter((a) => a.accessLevel === 'FULL').map((a) => a.agentId)
  const ownIds = user.agentAccess.filter((a) => a.accessLevel === 'OWN').map((a) => a.agentId)

  const parts: string[] = []
  const params: { name: string; type: unknown; value: unknown }[] = []

  if (fullIds.length > 0) {
    const placeholders = fullIds.map((_, i) => `@visF${i}`)
    parts.push(`e.AgentId IN (${placeholders.join(',')})`)
    fullIds.forEach((id, i) => params.push({ name: `visF${i}`, type: TYPES.BigInt, value: id }))
  }

  if (ownIds.length > 0) {
    const placeholders = ownIds.map((_, i) => `@visO${i}`)
    parts.push(`(e.AgentId IN (${placeholders.join(',')}) AND e.InvokedBy = @visInvokedBy)`)
    ownIds.forEach((id, i) => params.push({ name: `visO${i}`, type: TYPES.BigInt, value: id }))
    params.push({ name: 'visInvokedBy', type: TYPES.NVarChar, value: user.email })
  }

  return {
    where: ` AND (${parts.join(' OR ')})`,
    params,
  }
}

/**
 * Build agent list filter from the authenticated user's permissions.
 * Returns parameterized WHERE clause for Agent table queries.
 */
export function buildUserAgentFilter(user: AuthUser): { where: string; params: { name: string; type: unknown; value: unknown }[] } {
  if (user.isAdmin) return { where: '', params: [] }

  const allIds = user.agentAccess.map((a) => a.agentId)
  if (allIds.length === 0) {
    return { where: ' WHERE 1=0', params: [] }
  }

  const placeholders = allIds.map((_, i) => `@agF${i}`)
  const params = allIds.map((id, i) => ({ name: `agF${i}`, type: TYPES.BigInt as unknown, value: id as unknown }))
  return { where: ` WHERE Id IN (${placeholders.join(',')})`, params }
}
