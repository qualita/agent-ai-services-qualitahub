import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import bcrypt from 'bcrypt'
import { query, execute, TYPES } from './db.js'

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/* ──────────────────────────────────────────
   POST /api/auth/login
   ────────────────────────────────────────── */
app.http('authLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    let body: { email?: string; password?: string }
    try {
      body = (await req.json()) as { email?: string; password?: string }
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.email || !body.password) {
      return json({ error: 'Email and password are required' }, 400)
    }

    const users = await query(
      `SELECT Id, Email, Name, Password, IsAdmin FROM AppUser WHERE Email = @email AND IsActive = 1`,
      [{ name: 'email', type: TYPES.NVarChar, value: body.email.toLowerCase() }]
    )
    if (users.length === 0) return json({ error: 'Invalid credentials' }, 401)

    const user = users[0]
    const storedPw = user.Password as string
    const isHash = storedPw.startsWith('$2b$') || storedPw.startsWith('$2a$')
    const passwordOk = isHash
      ? await bcrypt.compare(body.password, storedPw)
      : storedPw === body.password
    if (!passwordOk) return json({ error: 'Invalid credentials' }, 401)

    const isAdmin = user.IsAdmin === true

    const groups = await query(
      `SELECT g.Id, g.Name
       FROM AccessGroup g
       JOIN UserGroup ug ON g.Id = ug.GroupId
       WHERE ug.UserId = @userId AND g.IsActive = 1`,
      [{ name: 'userId', type: TYPES.BigInt, value: user.Id }]
    )

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

    return json({
      id: user.Id,
      email: user.Email,
      name: user.Name,
      isAdmin,
      groups: groups.map((g) => ({ id: g.Id, name: g.Name })),
      agentAccess,
    })
  },
})

/* ──────────────────────────────────────────
   GET /api/auth/me
   Reads x-ms-client-principal (injected by SWA)
   and returns the AppUser record with groups/access.
   ────────────────────────────────────────── */
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const header = req.headers.get('x-ms-client-principal')
    if (!header) return json({ error: 'Not authenticated' }, 401)

    let email: string
    try {
      const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
      email = (decoded.userDetails ?? decoded.email ?? '').toLowerCase()
      if (!email) return json({ error: 'No email in principal' }, 401)
    } catch {
      return json({ error: 'Invalid principal' }, 401)
    }

    const users = await query(
      `SELECT Id, Email, Name, IsAdmin FROM AppUser WHERE Email = @email AND IsActive = 1`,
      [{ name: 'email', type: TYPES.NVarChar, value: email }]
    )
    if (users.length === 0) return json({ error: 'User not authorized' }, 403)

    const user = users[0]
    const isAdmin = user.IsAdmin === true

    const groups = await query(
      `SELECT g.Id, g.Name
       FROM AccessGroup g
       JOIN UserGroup ug ON g.Id = ug.GroupId
       WHERE ug.UserId = @userId AND g.IsActive = 1`,
      [{ name: 'userId', type: TYPES.BigInt, value: user.Id }]
    )

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

    return json({
      id: user.Id,
      email: user.Email,
      name: user.Name,
      isAdmin,
      groups: groups.map((g: Record<string, unknown>) => ({ id: g.Id, name: g.Name })),
      agentAccess,
    })
  },
})

/* ──────────────────────────────────────────
   GET /api/mgmt/users
   ────────────────────────────────────────── */
app.http('adminListUsers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mgmt/users',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const users = await query(`
      SELECT u.Id, u.Email, u.Name, u.IsAdmin, u.IsActive, u.CreatedAtUtc
      FROM AppUser u ORDER BY u.Name
    `)

    const userGroups = await query(`
      SELECT ug.UserId, g.Id AS groupId, g.Name AS groupName
      FROM UserGroup ug JOIN AccessGroup g ON ug.GroupId = g.Id
      ORDER BY ug.UserId, g.Name
    `)

    const groupMap: Record<number, { id: number; name: string }[]> = {}
    for (const ug of userGroups) {
      const uid = ug.UserId as number
      if (!groupMap[uid]) groupMap[uid] = []
      groupMap[uid].push({ id: ug.groupId as number, name: ug.groupName as string })
    }

    const userAgents = await query(`
      SELECT ua.UserId, a.Id AS agentId, a.Name AS agentName, ua.AccessLevel
      FROM UserAgent ua JOIN Agent a ON ua.AgentId = a.Id
      ORDER BY ua.UserId, a.Name
    `)

    const directAgentMap: Record<number, { agentId: number; agentName: string; accessLevel: string }[]> = {}
    for (const ua of userAgents) {
      const uid = ua.UserId as number
      if (!directAgentMap[uid]) directAgentMap[uid] = []
      directAgentMap[uid].push({
        agentId: ua.agentId as number,
        agentName: ua.agentName as string,
        accessLevel: ua.AccessLevel as string,
      })
    }

    return json(
      users.map((u) => ({
        id: u.Id,
        email: u.Email,
        name: u.Name,
        isAdmin: u.IsAdmin,
        isActive: u.IsActive,
        createdAt: u.CreatedAtUtc,
        groups: groupMap[u.Id as number] || [],
        directAgents: directAgentMap[u.Id as number] || [],
      }))
    )
  },
})

/* ──────────────────────────────────────────
   POST /api/mgmt/users
   ────────────────────────────────────────── */
app.http('adminCreateUser', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'mgmt/users',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    let body: { email?: string; name?: string; password?: string; isAdmin?: boolean; groupIds?: number[] }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.email || !body.name) {
      return json({ error: 'Email and name are required' }, 400)
    }

    const existing = await query(
      `SELECT Id FROM AppUser WHERE Email = @email`,
      [{ name: 'email', type: TYPES.NVarChar, value: body.email.toLowerCase() }]
    )
    if (existing.length > 0) return json({ error: 'Email already exists' }, 409)

    const result = await query(
      `INSERT INTO AppUser (Email, Name, Password, IsAdmin, IsActive, CreatedAtUtc, UpdatedAtUtc)
       OUTPUT INSERTED.Id
       VALUES (@email, @name, @password, @isAdmin, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: 'email', type: TYPES.NVarChar, value: body.email.toLowerCase() },
        { name: 'name', type: TYPES.NVarChar, value: body.name },
        { name: 'password', type: TYPES.NVarChar, value: body.password || 'entra-id' },
        { name: 'isAdmin', type: TYPES.Bit, value: body.isAdmin ?? false },
      ]
    )

    const userId = result[0].Id as number

    if (body.groupIds && body.groupIds.length > 0) {
      for (const groupId of body.groupIds) {
        await execute(
          `INSERT INTO UserGroup (UserId, GroupId, CreatedAtUtc) VALUES (@userId, @groupId, SYSUTCDATETIME())`,
          [
            { name: 'userId', type: TYPES.BigInt, value: userId },
            { name: 'groupId', type: TYPES.BigInt, value: groupId },
          ]
        )
      }
    }

    return json({ id: userId, email: body.email.toLowerCase(), name: body.name, isActive: true }, 201)
  },
})

/* ──────────────────────────────────────────
   PUT /api/mgmt/users/{id}
   ────────────────────────────────────────── */
app.http('adminUpdateUser', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'mgmt/users/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    let body: { email?: string; name?: string; password?: string; isActive?: boolean; isAdmin?: boolean }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    const sets: string[] = []
    const params: { name: string; type: unknown; value: unknown }[] = [
      { name: 'id', type: TYPES.BigInt, value: id },
    ]

    if (body.email !== undefined) {
      const dup = await query(
        `SELECT Id FROM AppUser WHERE Email = @email AND Id != @id`,
        [
          { name: 'email', type: TYPES.NVarChar, value: body.email.toLowerCase() },
          { name: 'id', type: TYPES.BigInt, value: id },
        ]
      )
      if (dup.length > 0) return json({ error: 'Email already exists' }, 409)
      sets.push('Email = @email')
      params.push({ name: 'email', type: TYPES.NVarChar, value: body.email.toLowerCase() })
    }
    if (body.name !== undefined) {
      sets.push('Name = @name')
      params.push({ name: 'name', type: TYPES.NVarChar, value: body.name })
    }
    if (body.password !== undefined) {
      sets.push('Password = @password')
      params.push({ name: 'password', type: TYPES.NVarChar, value: body.password })
    }
    if (body.isActive !== undefined) {
      sets.push('IsActive = @isActive')
      params.push({ name: 'isActive', type: TYPES.Bit, value: body.isActive })
    }
    if (body.isAdmin !== undefined) {
      sets.push('IsAdmin = @isAdmin')
      params.push({ name: 'isAdmin', type: TYPES.Bit, value: body.isAdmin })
    }

    if (sets.length === 0) return json({ error: 'No fields to update' }, 400)

    sets.push('UpdatedAtUtc = SYSUTCDATETIME()')

    const affected = await execute(
      `UPDATE AppUser SET ${sets.join(', ')} WHERE Id = @id`,
      params
    )

    if (affected === 0) return json({ error: 'User not found' }, 404)
    return json({ success: true })
  },
})

/* ──────────────────────────────────────────
   PUT /api/mgmt/users/{id}/groups
   ────────────────────────────────────────── */
app.http('adminUpdateUserGroups', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'mgmt/users/{id}/groups',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    let body: { groupIds?: number[] }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.groupIds) return json({ error: 'groupIds is required' }, 400)

    const userCheck = await query(`SELECT Id FROM AppUser WHERE Id = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])
    if (userCheck.length === 0) return json({ error: 'User not found' }, 404)

    await execute(`DELETE FROM UserGroup WHERE UserId = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])

    for (const groupId of body.groupIds) {
      await execute(
        `INSERT INTO UserGroup (UserId, GroupId, CreatedAtUtc) VALUES (@userId, @groupId, SYSUTCDATETIME())`,
        [
          { name: 'userId', type: TYPES.BigInt, value: id },
          { name: 'groupId', type: TYPES.BigInt, value: groupId },
        ]
      )
    }

    return json({ success: true })
  },
})

/* ──────────────────────────────────────────
   PUT /api/mgmt/users/{id}/agents
   ────────────────────────────────────────── */
app.http('adminUpdateUserAgents', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'mgmt/users/{id}/agents',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    let body: { agents?: { agentId: number; accessLevel: string }[] }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.agents) return json({ error: 'agents is required' }, 400)

    const userCheck = await query(`SELECT Id FROM AppUser WHERE Id = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])
    if (userCheck.length === 0) return json({ error: 'User not found' }, 404)

    await execute(`DELETE FROM UserAgent WHERE UserId = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])

    for (const a of body.agents) {
      const lvl = a.accessLevel === 'OWN' ? 'OWN' : 'FULL'
      await execute(
        `INSERT INTO UserAgent (UserId, AgentId, AccessLevel, CreatedAtUtc) VALUES (@userId, @agentId, @lvl, SYSUTCDATETIME())`,
        [
          { name: 'userId', type: TYPES.BigInt, value: id },
          { name: 'agentId', type: TYPES.BigInt, value: a.agentId },
          { name: 'lvl', type: TYPES.NVarChar, value: lvl },
        ]
      )
    }

    return json({ success: true })
  },
})

/* ──────────────────────────────────────────
   GET /api/mgmt/groups
   ────────────────────────────────────────── */
app.http('adminListGroups', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mgmt/groups',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const groups = await query(`
      SELECT g.Id, g.Name, g.Description, g.IsActive, g.CreatedAtUtc,
             (SELECT COUNT(*) FROM UserGroup ug WHERE ug.GroupId = g.Id) AS userCount
      FROM AccessGroup g
      ORDER BY g.Name
    `)

    const groupAgents = await query(`
      SELECT ga.GroupId, a.Id AS agentId, a.Name AS agentName, ga.AccessLevel
      FROM GroupAgent ga JOIN Agent a ON ga.AgentId = a.Id
      ORDER BY ga.GroupId, a.Name
    `)

    const agentMap: Record<number, { agentId: number; agentName: string; accessLevel: string }[]> = {}
    for (const ga of groupAgents) {
      const gid = ga.GroupId as number
      if (!agentMap[gid]) agentMap[gid] = []
      agentMap[gid].push({
        agentId: ga.agentId as number,
        agentName: ga.agentName as string,
        accessLevel: ga.AccessLevel as string,
      })
    }

    return json(
      groups.map((g) => ({
        id: g.Id,
        name: g.Name,
        description: g.Description,
        isActive: g.IsActive,
        createdAt: g.CreatedAtUtc,
        userCount: g.userCount,
        agents: agentMap[g.Id as number] || [],
      }))
    )
  },
})

/* ──────────────────────────────────────────
   POST /api/mgmt/groups
   ────────────────────────────────────────── */
app.http('adminCreateGroup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'mgmt/groups',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    let body: { name?: string; description?: string; agents?: { agentId: number; accessLevel: string }[] }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.name) return json({ error: 'Name is required' }, 400)

    const existing = await query(`SELECT Id FROM AccessGroup WHERE Name = @name`, [
      { name: 'name', type: TYPES.NVarChar, value: body.name },
    ])
    if (existing.length > 0) return json({ error: 'Group name already exists' }, 409)

    const result = await query(
      `INSERT INTO AccessGroup (Name, Description, IsActive, CreatedAtUtc, UpdatedAtUtc)
       OUTPUT INSERTED.Id
       VALUES (@name, @desc, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: 'name', type: TYPES.NVarChar, value: body.name },
        { name: 'desc', type: TYPES.NVarChar, value: body.description || null },
      ]
    )

    const groupId = result[0].Id as number

    if (body.agents && body.agents.length > 0) {
      for (const a of body.agents) {
        const lvl = a.accessLevel === 'OWN' ? 'OWN' : 'FULL'
        await execute(
          `INSERT INTO GroupAgent (GroupId, AgentId, AccessLevel, CreatedAtUtc) VALUES (@groupId, @agentId, @lvl, SYSUTCDATETIME())`,
          [
            { name: 'groupId', type: TYPES.BigInt, value: groupId },
            { name: 'agentId', type: TYPES.BigInt, value: a.agentId },
            { name: 'lvl', type: TYPES.NVarChar, value: lvl },
          ]
        )
      }
    }

    return json({ id: groupId, name: body.name }, 201)
  },
})

/* ──────────────────────────────────────────
   PUT /api/mgmt/groups/{id}
   ────────────────────────────────────────── */
app.http('adminUpdateGroup', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'mgmt/groups/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    let body: { name?: string; description?: string; isActive?: boolean }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    const sets: string[] = []
    const params: { name: string; type: unknown; value: unknown }[] = [
      { name: 'id', type: TYPES.BigInt, value: id },
    ]

    if (body.name !== undefined) {
      const dup = await query(`SELECT Id FROM AccessGroup WHERE Name = @name AND Id != @id`, [
        { name: 'name', type: TYPES.NVarChar, value: body.name },
        { name: 'id', type: TYPES.BigInt, value: id },
      ])
      if (dup.length > 0) return json({ error: 'Group name already exists' }, 409)
      sets.push('Name = @name')
      params.push({ name: 'name', type: TYPES.NVarChar, value: body.name })
    }
    if (body.description !== undefined) {
      sets.push('Description = @desc')
      params.push({ name: 'desc', type: TYPES.NVarChar, value: body.description })
    }
    if (body.isActive !== undefined) {
      sets.push('IsActive = @isActive')
      params.push({ name: 'isActive', type: TYPES.Bit, value: body.isActive })
    }

    if (sets.length === 0) return json({ error: 'No fields to update' }, 400)

    sets.push('UpdatedAtUtc = SYSUTCDATETIME()')

    const affected = await execute(
      `UPDATE AccessGroup SET ${sets.join(', ')} WHERE Id = @id`,
      params
    )

    if (affected === 0) return json({ error: 'Group not found' }, 404)
    return json({ success: true })
  },
})

/* ──────────────────────────────────────────
   PUT /api/mgmt/groups/{id}/agents
   ────────────────────────────────────────── */
app.http('adminUpdateGroupAgents', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'mgmt/groups/{id}/agents',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    let body: { agents?: { agentId: number; accessLevel: string }[] }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.agents) return json({ error: 'agents is required' }, 400)

    const groupCheck = await query(`SELECT Id FROM AccessGroup WHERE Id = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])
    if (groupCheck.length === 0) return json({ error: 'Group not found' }, 404)

    await execute(`DELETE FROM GroupAgent WHERE GroupId = @id`, [
      { name: 'id', type: TYPES.BigInt, value: id },
    ])

    for (const a of body.agents) {
      const lvl = a.accessLevel === 'OWN' ? 'OWN' : 'FULL'
      await execute(
        `INSERT INTO GroupAgent (GroupId, AgentId, AccessLevel, CreatedAtUtc) VALUES (@groupId, @agentId, @lvl, SYSUTCDATETIME())`,
        [
          { name: 'groupId', type: TYPES.BigInt, value: id },
          { name: 'agentId', type: TYPES.BigInt, value: a.agentId },
          { name: 'lvl', type: TYPES.NVarChar, value: lvl },
        ]
      )
    }

    return json({ success: true })
  },
})
