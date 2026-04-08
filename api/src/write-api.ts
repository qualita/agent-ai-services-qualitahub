import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { query, execute, queryScalar, TYPES } from './db.js'
import { createHash } from 'crypto'
import { uploadBlob } from './storage.js'

/* ── Helpers ────────────────────────────────────────────── */

function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Status code → StatusCatalog.Id mapping (loaded once from DB, then cached) */
let statusCache: Record<string, number> | null = null

async function getStatusIds(): Promise<Record<string, number>> {
  if (statusCache) return statusCache
  const rows = await query('SELECT Id, Code FROM StatusCatalog')
  statusCache = {}
  for (const r of rows) {
    statusCache[r.Code as string] = r.Id as number
  }
  return statusCache
}

/* ── API Key Authentication ─────────────────────────────── */

interface ApiKeyInfo {
  agentId: number
  agentCode: string
  keyId: number
}

/**
 * Validates X-API-Key header against the ApiKey table.
 * Returns agent info or null if invalid.
 * Updates LastUsedAt on successful auth.
 */
async function validateApiKey(req: HttpRequest): Promise<ApiKeyInfo | null> {
  const rawKey = req.headers.get('x-api-key')
  if (!rawKey) return null

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const rows = await query(
    `SELECT k.Id, k.AgentId, a.Code AS AgentCode, k.ExpiresAt
     FROM ApiKey k
     JOIN Agent a ON a.Id = k.AgentId
     WHERE k.KeyHash = @keyHash AND k.IsActive = 1`,
    [{ name: 'keyHash', type: TYPES.NVarChar, value: keyHash }]
  )

  if (rows.length === 0) return null

  const key = rows[0]

  // Check expiration
  if (key.ExpiresAt && new Date(key.ExpiresAt as string) < new Date()) {
    return null
  }

  // Update last used timestamp (fire-and-forget)
  execute(
    `UPDATE ApiKey SET LastUsedAt = SYSUTCDATETIME() WHERE Id = @id`,
    [{ name: 'id', type: TYPES.BigInt, value: key.Id }]
  ).catch(() => {/* ignore */})

  return { agentId: key.AgentId as number, agentCode: key.AgentCode as string, keyId: key.Id as number }
}

/** Require valid API key or return 401 response */
async function requireApiKey(req: HttpRequest): Promise<ApiKeyInfo | HttpResponseInit> {
  const info = await validateApiKey(req)
  if (!info) {
    return json({ error: 'Invalid or missing API key. Provide X-API-Key header.' }, 401)
  }
  return info
}

function isHttpResponse(v: ApiKeyInfo | HttpResponseInit): v is HttpResponseInit {
  return 'status' in v && typeof (v as HttpResponseInit).status === 'number'
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\.\./g, '_')
}

function buildBlobPath(agentCode: string, executionGuid: string, direction: 'inputs' | 'outputs', fileName: string): string {
  return `${agentCode}/${executionGuid}/${direction}/${sanitizeFileName(fileName)}`
}

/* ── POST /api/executions/start ─────────────────────────── */

interface InputBody {
  inputType: string
  fileName?: string
  mimeType?: string
  filePath?: string
  contentText?: string
  storageProvider?: string
  receivedTime?: string
  fileContent?: string  // base64-encoded file — API will upload to Blob Storage
}

interface StartBody {
  triggerSource?: string
  invokedBy?: string
  inputs?: InputBody[]
}

app.http('executionStart', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'executions/start',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await requireApiKey(req)
    if (isHttpResponse(auth)) return auth

    let body: StartBody = {}
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        body = (await req.json()) as StartBody
      } catch (e) {
        ctx.error('executionStart: failed to parse JSON body', e)
        return json({ error: 'Invalid JSON body' }, 400)
      }
    }

    const statusIds = await getStatusIds()

    const result = await query(
      `INSERT INTO Execution (AgentId, OverallStatus, StartTime, TriggerSource, InvokedBy, ExecutionGuid, CreatedAtUtc, CreatedBy)
       OUTPUT INSERTED.Id, LOWER(CAST(INSERTED.ExecutionGuid AS NVARCHAR(36))) AS ExecutionGuid
       VALUES (@agentId, @status, SYSUTCDATETIME(), @triggerSource, @invokedBy, NEWID(), SYSUTCDATETIME(), 'api-key')`,
      [
        { name: 'agentId', type: TYPES.BigInt, value: auth.agentId },
        { name: 'status', type: TYPES.BigInt, value: statusIds.RUNNING },
        { name: 'triggerSource', type: TYPES.NVarChar, value: body.triggerSource ?? 'API' },
        { name: 'invokedBy', type: TYPES.NVarChar, value: body.invokedBy ?? null },
      ]
    )

    const executionId = result[0].Id as number
    const executionGuid = result[0].ExecutionGuid as string

    // Insert inputs if provided at start time
    if (body.inputs && body.inputs.length > 0) {
      for (const input of body.inputs) {
        let filePath = input.filePath ?? null
        let storageProvider = input.storageProvider ?? null
        let contentText = input.contentText ?? null
        if (input.fileContent) {
          const fname = input.fileName ?? `input_${Date.now()}.bin`
          const blobPath = buildBlobPath(auth.agentCode, executionGuid, 'inputs', fname)
          ctx.log(`executionStart: uploading blob ${blobPath} (${input.fileContent.length} base64 chars)`)
          try {
            await uploadBlob(blobPath, Buffer.from(input.fileContent, 'base64'), input.mimeType ?? 'application/octet-stream')
            filePath = blobPath
            storageProvider = 'AZURE_BLOB'
            contentText = null
            ctx.log(`executionStart: blob uploaded OK → ${blobPath}`)
          } catch (e) {
            ctx.error(`executionStart: blob upload failed for ${blobPath}`, e)
            return json({ error: `Blob upload failed: ${(e as Error).message}` }, 500)
          }
        }
        await execute(
          `INSERT INTO Input (ExecutionId, InputType, FileName, MimeType, FilePath, ContentText, StorageProvider, ReceivedTime, CreatedAtUtc, CreatedBy)
           VALUES (@executionId, @inputType, @fileName, @mimeType, @filePath, @contentText, @storageProvider, @receivedTime, SYSUTCDATETIME(), 'api-key')`,
          [
            { name: 'executionId', type: TYPES.BigInt, value: executionId },
            { name: 'inputType', type: TYPES.NVarChar, value: input.inputType },
            { name: 'fileName', type: TYPES.NVarChar, value: input.fileName ?? null },
            { name: 'mimeType', type: TYPES.NVarChar, value: input.mimeType ?? null },
            { name: 'filePath', type: TYPES.NVarChar, value: filePath },
            { name: 'contentText', type: TYPES.NVarChar, value: contentText },
            { name: 'storageProvider', type: TYPES.NVarChar, value: storageProvider },
            { name: 'receivedTime', type: TYPES.DateTime2, value: input.receivedTime ? new Date(input.receivedTime) : new Date() },
          ]
        )
      }
    }

    ctx.log(`executionStart: created executionId=${executionId} guid=${executionGuid} inputs=${body.inputs?.length ?? 0}`)
    return json({ executionId, executionGuid, inputsInserted: body.inputs?.length ?? 0 }, 201)
  },
})

/* ── POST /api/executions/{id}/steps ────────────────────── */

interface StepBody {
  stepOrder: number
  stepName: string
  status: string
  description?: string
  startTime?: string
  finishTime?: string
  durationMs?: number
  errorMessage?: string
}

app.http('executionAddStep', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'executions/{id}/steps',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await requireApiKey(req)
    if (isHttpResponse(auth)) return auth

    const executionId = Number(req.params.id)
    if (isNaN(executionId)) return json({ error: 'Invalid execution id' }, 400)

    // Verify execution belongs to this agent
    const owner = await queryScalar<number>(
      `SELECT AgentId FROM Execution WHERE Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: executionId }]
    )
    if (owner === null) return json({ error: 'Execution not found' }, 404)
    if (owner !== auth.agentId) return json({ error: 'Execution does not belong to this agent' }, 403)

    let body: StepBody
    try {
      body = (await req.json()) as StepBody
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.stepName || body.stepOrder === undefined || !body.status) {
      return json({ error: 'stepOrder, stepName, and status are required' }, 400)
    }

    const statusIds = await getStatusIds()
    const validStatuses = Object.keys(statusIds)
    if (!validStatuses.includes(body.status.toUpperCase())) {
      return json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400)
    }

    const stepStatusId = statusIds[body.status.toUpperCase()]

    const result = await query(
      `INSERT INTO ExecutionStep (ExecutionId, StepOrder, StepName, StatusId, Description, StartTime, FinishTime, DurationMs, ErrorMessage, CreatedAtUtc, CreatedBy)
       OUTPUT INSERTED.Id
       VALUES (@executionId, @stepOrder, @stepName, @statusId, @description, @startTime, @finishTime, @durationMs, @errorMessage, SYSUTCDATETIME(), 'api-key')`,
      [
        { name: 'executionId', type: TYPES.BigInt, value: executionId },
        { name: 'stepOrder', type: TYPES.Int, value: body.stepOrder },
        { name: 'stepName', type: TYPES.NVarChar, value: body.stepName },
        { name: 'statusId', type: TYPES.BigInt, value: stepStatusId },
        { name: 'description', type: TYPES.NVarChar, value: body.description ?? null },
        { name: 'startTime', type: TYPES.DateTime2, value: body.startTime ? new Date(body.startTime) : null },
        { name: 'finishTime', type: TYPES.DateTime2, value: body.finishTime ? new Date(body.finishTime) : null },
        { name: 'durationMs', type: TYPES.Int, value: body.durationMs ?? null },
        { name: 'errorMessage', type: TYPES.NVarChar, value: body.errorMessage ?? null },
      ]
    )

    return json({ stepId: result[0].Id }, 201)
  },
})

/* ── POST /api/executions/{id}/finish ───────────────────── */

interface OutputBody {
  outputType: string
  fileName?: string
  mimeType?: string
  filePath?: string
  contentText?: string
  storageProvider?: string
  fileContent?: string  // base64-encoded file — API will upload to Blob Storage
}

interface FinishBody {
  status: string
  errorMessage?: string
  steps?: StepBody[]
  inputs?: InputBody[]
  outputs?: OutputBody[]
}

app.http('executionFinish', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'executions/{id}/finish',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await requireApiKey(req)
    if (isHttpResponse(auth)) return auth

    const executionId = Number(req.params.id)
    if (isNaN(executionId)) return json({ error: 'Invalid execution id' }, 400)

    // Verify execution belongs to this agent and exists
    const execRows = await query(
      `SELECT e.AgentId, e.OverallStatus, LOWER(CAST(e.ExecutionGuid AS NVARCHAR(36))) AS ExecutionGuid
       FROM Execution e WHERE e.Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: executionId }]
    )
    if (execRows.length === 0) return json({ error: 'Execution not found' }, 404)
    if ((execRows[0].AgentId as number) !== auth.agentId) {
      return json({ error: 'Execution does not belong to this agent' }, 403)
    }
    const executionGuid = execRows[0].ExecutionGuid as string

    let body: FinishBody
    try {
      body = (await req.json()) as FinishBody
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.status) {
      return json({ error: 'status is required' }, 400)
    }

    const statusCode = body.status.toUpperCase()
    const statusIds = await getStatusIds()
    const statusId = statusIds[statusCode]
    if (!statusId) {
      return json({ error: `Invalid status. Must be one of: ${Object.keys(statusIds).join(', ')}` }, 400)
    }

    // Update execution
    await execute(
      `UPDATE Execution
       SET OverallStatus = @status,
           FinishTime = SYSUTCDATETIME(),
           ErrorMessage = @errorMessage,
           UpdatedAtUtc = SYSUTCDATETIME(),
           UpdatedBy = 'api-key'
       WHERE Id = @id`,
      [
        { name: 'status', type: TYPES.BigInt, value: statusId },
        { name: 'errorMessage', type: TYPES.NVarChar, value: body.errorMessage ?? null },
        { name: 'id', type: TYPES.BigInt, value: executionId },
      ]
    )

    // Insert steps (if provided)
    if (body.steps && body.steps.length > 0) {
      for (const step of body.steps) {
        const sId = statusIds[(step.status || 'SUCCESS').toUpperCase()]
        await execute(
          `INSERT INTO ExecutionStep (ExecutionId, StepOrder, StepName, StatusId, Description, StartTime, FinishTime, DurationMs, ErrorMessage, CreatedAtUtc, CreatedBy)
           VALUES (@executionId, @stepOrder, @stepName, @statusId, @description, @startTime, @finishTime, @durationMs, @errorMessage, SYSUTCDATETIME(), 'api-key')`,
          [
            { name: 'executionId', type: TYPES.BigInt, value: executionId },
            { name: 'stepOrder', type: TYPES.Int, value: step.stepOrder },
            { name: 'stepName', type: TYPES.NVarChar, value: step.stepName },
            { name: 'statusId', type: TYPES.BigInt, value: sId },
            { name: 'description', type: TYPES.NVarChar, value: step.description ?? null },
            { name: 'startTime', type: TYPES.DateTime2, value: step.startTime ? new Date(step.startTime) : null },
            { name: 'finishTime', type: TYPES.DateTime2, value: step.finishTime ? new Date(step.finishTime) : null },
            { name: 'durationMs', type: TYPES.Int, value: step.durationMs ?? null },
            { name: 'errorMessage', type: TYPES.NVarChar, value: step.errorMessage ?? null },
          ]
        )
      }
    }

    // Insert inputs (if provided)
    if (body.inputs && body.inputs.length > 0) {
      for (const input of body.inputs) {
        let filePath = input.filePath ?? null
        let storageProvider = input.storageProvider ?? null
        let contentText = input.contentText ?? null
        if (input.fileContent) {
          const fname = input.fileName ?? `input_${Date.now()}.bin`
          const blobPath = buildBlobPath(auth.agentCode, executionGuid, 'inputs', fname)
          ctx.log(`executionFinish: uploading input blob ${blobPath}`)
          try {
            await uploadBlob(blobPath, Buffer.from(input.fileContent, 'base64'), input.mimeType ?? 'application/octet-stream')
            filePath = blobPath
            storageProvider = 'AZURE_BLOB'
            contentText = null
          } catch (e) {
            ctx.error(`executionFinish: input blob upload failed for ${blobPath}`, e)
            return json({ error: `Input blob upload failed: ${(e as Error).message}` }, 500)
          }
        }
        await execute(
          `INSERT INTO Input (ExecutionId, InputType, FileName, MimeType, FilePath, ContentText, StorageProvider, ReceivedTime, CreatedAtUtc, CreatedBy)
           VALUES (@executionId, @inputType, @fileName, @mimeType, @filePath, @contentText, @storageProvider, @receivedTime, SYSUTCDATETIME(), 'api-key')`,
          [
            { name: 'executionId', type: TYPES.BigInt, value: executionId },
            { name: 'inputType', type: TYPES.NVarChar, value: input.inputType },
            { name: 'fileName', type: TYPES.NVarChar, value: input.fileName ?? null },
            { name: 'mimeType', type: TYPES.NVarChar, value: input.mimeType ?? null },
            { name: 'filePath', type: TYPES.NVarChar, value: filePath },
            { name: 'contentText', type: TYPES.NVarChar, value: contentText },
            { name: 'storageProvider', type: TYPES.NVarChar, value: storageProvider },
            { name: 'receivedTime', type: TYPES.DateTime2, value: input.receivedTime ? new Date(input.receivedTime) : new Date() },
          ]
        )
      }
    }

    // Insert outputs (if provided)
    if (body.outputs && body.outputs.length > 0) {
      for (const output of body.outputs) {
        let filePath = output.filePath ?? null
        let storageProvider = output.storageProvider ?? null
        let contentText = output.contentText ?? null
        if (output.fileContent) {
          const fname = output.fileName ?? `output_${Date.now()}.bin`
          const blobPath = buildBlobPath(auth.agentCode, executionGuid, 'outputs', fname)
          ctx.log(`executionFinish: uploading output blob ${blobPath}`)
          try {
            await uploadBlob(blobPath, Buffer.from(output.fileContent, 'base64'), output.mimeType ?? 'application/octet-stream')
            filePath = blobPath
            storageProvider = 'AZURE_BLOB'
            contentText = null
          } catch (e) {
            ctx.error(`executionFinish: output blob upload failed for ${blobPath}`, e)
            return json({ error: `Output blob upload failed: ${(e as Error).message}` }, 500)
          }
        }
        await execute(
          `INSERT INTO Output (ExecutionId, OutputType, FileName, MimeType, FilePath, ContentText, StorageProvider, CreatedAtUtc, CreatedBy)
           VALUES (@executionId, @outputType, @fileName, @mimeType, @filePath, @contentText, @storageProvider, SYSUTCDATETIME(), 'api-key')`,
          [
            { name: 'executionId', type: TYPES.BigInt, value: executionId },
            { name: 'outputType', type: TYPES.NVarChar, value: output.outputType },
            { name: 'fileName', type: TYPES.NVarChar, value: output.fileName ?? null },
            { name: 'mimeType', type: TYPES.NVarChar, value: output.mimeType ?? null },
            { name: 'filePath', type: TYPES.NVarChar, value: filePath },
            { name: 'contentText', type: TYPES.NVarChar, value: contentText },
            { name: 'storageProvider', type: TYPES.NVarChar, value: storageProvider },
          ]
        )
      }
    }

    return json({
      success: true,
      executionId,
      status: statusCode,
      stepsInserted: body.steps?.length ?? 0,
      inputsInserted: body.inputs?.length ?? 0,
      outputsInserted: body.outputs?.length ?? 0,
    })
  },
})

/* ── POST /api/mgmt/api-keys ───────────────────────────── */

app.http('createApiKey', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'mgmt/api-keys',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    let body: { agentId?: number; name?: string; expiresAt?: string }
    try {
      body = (await req.json()) as typeof body
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    if (!body.agentId || !body.name) {
      return json({ error: 'agentId and name are required' }, 400)
    }

    // Verify agent exists
    const agent = await queryScalar<number>(
      `SELECT Id FROM Agent WHERE Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: body.agentId }]
    )
    if (agent === null) return json({ error: 'Agent not found' }, 404)

    // Get agent code for key prefix
    const agentCode = await queryScalar<string>(
      `SELECT Code FROM Agent WHERE Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: body.agentId }]
    )

    // Generate key
    const { randomBytes } = await import('crypto')
    const rawKey = `aais_${agentCode}_${randomBytes(24).toString('hex')}`
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.substring(0, 14)

    const result = await query(
      `INSERT INTO ApiKey (AgentId, KeyHash, KeyPrefix, Name, IsActive, ExpiresAt, CreatedAtUtc, CreatedBy)
       OUTPUT INSERTED.Id
       VALUES (@agentId, @keyHash, @keyPrefix, @name, 1, @expiresAt, SYSUTCDATETIME(), 'admin')`,
      [
        { name: 'agentId', type: TYPES.BigInt, value: body.agentId },
        { name: 'keyHash', type: TYPES.NVarChar, value: keyHash },
        { name: 'keyPrefix', type: TYPES.NVarChar, value: keyPrefix },
        { name: 'name', type: TYPES.NVarChar, value: body.name },
        { name: 'expiresAt', type: TYPES.DateTime2, value: body.expiresAt ? new Date(body.expiresAt) : null },
      ]
    )

    return json({
      id: result[0].Id,
      apiKey: rawKey,
      keyPrefix,
      message: 'Save this API key now — it cannot be retrieved again.',
    }, 201)
  },
})

/* ── GET /api/mgmt/api-keys ────────────────────────────── */

app.http('listApiKeys', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mgmt/api-keys',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const rows = await query(
      `SELECT k.Id, k.AgentId, a.Name AS agentName, k.KeyPrefix, k.Name, k.IsActive, k.CreatedAtUtc, k.ExpiresAt, k.LastUsedAt
       FROM ApiKey k
       JOIN Agent a ON k.AgentId = a.Id
       ORDER BY k.CreatedAtUtc DESC`
    )

    return json(
      rows.map((r) => ({
        id: r.Id,
        agentId: r.AgentId,
        agentName: r.agentName,
        keyPrefix: r.KeyPrefix,
        name: r.Name,
        isActive: r.IsActive,
        createdAt: r.CreatedAtUtc,
        expiresAt: r.ExpiresAt,
        lastUsedAt: r.LastUsedAt,
      }))
    )
  },
})

/* ── GET /api/auth/check-access ──────────────────────────
   Called by Logic Apps/agents to verify a user has access
   to a specific agent before invoking it.
   Auth: X-API-Key header
   Query: userEmail, agentCode
   ─────────────────────────────────────────────────────── */

app.http('authCheckAccess', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/check-access',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const auth = await requireApiKey(req)
    if (isHttpResponse(auth)) return auth

    const userEmail = req.query.get('userEmail')?.toLowerCase()
    const agentCode = req.query.get('agentCode')

    if (!userEmail || !agentCode) {
      return json({ error: 'Query parameters userEmail and agentCode are required' }, 400)
    }

    // Look up the agent
    const agents = await query(
      `SELECT Id, Code, Name FROM Agent WHERE Code = @code AND IsActive = 1`,
      [{ name: 'code', type: TYPES.NVarChar, value: agentCode }]
    )
    if (agents.length === 0) {
      return json({
        allowed: false,
        reason: 'AGENT_NOT_FOUND',
        message: `Agent with code ${agentCode} not found or inactive`,
      })
    }
    const agent = agents[0]
    const agentId = agent.Id as number

    // Look up the user (match on Email or EmailAlias for cross-tenant support)
    const users = await query(
      `SELECT Id, Email, Name, IsAdmin FROM AppUser WHERE (Email = @email OR EmailAlias = @email) AND IsActive = 1`,
      [{ name: 'email', type: TYPES.NVarChar, value: userEmail }]
    )
    if (users.length === 0) {
      return json({
        allowed: false,
        reason: 'USER_NOT_FOUND',
        message: `User ${userEmail} is not registered or inactive`,
      })
    }
    const user = users[0]
    const isAdmin = user.IsAdmin === true

    // Admins have full access to all agents
    if (isAdmin) {
      ctx.log(`checkAccess: admin ${userEmail} → agent ${agentCode} → FULL`)
      return json({
        allowed: true,
        accessLevel: 'FULL',
        reason: 'ADMIN',
        message: 'User is an administrator',
        user: { id: user.Id, email: user.Email, name: user.Name },
        agent: { id: agent.Id, code: agent.Code, name: agent.Name },
      })
    }

    // Check group + direct access
    const accessRows = await query(
      `SELECT AccessLevel FROM (
         SELECT ga.AccessLevel
         FROM GroupAgent ga
         JOIN UserGroup ug ON ga.GroupId = ug.GroupId
         WHERE ug.UserId = @userId AND ga.AgentId = @agentId
         UNION ALL
         SELECT ua.AccessLevel
         FROM UserAgent ua
         WHERE ua.UserId = @userId AND ua.AgentId = @agentId
       ) allAccess`,
      [
        { name: 'userId', type: TYPES.BigInt, value: user.Id },
        { name: 'agentId', type: TYPES.BigInt, value: agentId },
      ]
    )

    if (accessRows.length === 0) {
      ctx.log(`checkAccess: ${userEmail} → agent ${agentCode} → NO_ACCESS`)
      return json({
        allowed: false,
        reason: 'NO_ACCESS',
        message: `User ${userEmail} does not have access to agent ${agentCode}`,
        user: { id: user.Id, email: user.Email, name: user.Name },
        agent: { id: agent.Id, code: agent.Code, name: agent.Name },
      })
    }

    // Pick highest access level (FULL > VIEW)
    const hasFullAccess = accessRows.some((r) => r.AccessLevel === 'FULL')
    const accessLevel = hasFullAccess ? 'FULL' : (accessRows[0].AccessLevel as string)

    ctx.log(`checkAccess: ${userEmail} → agent ${agentCode} → ${accessLevel}`)
    return json({
      allowed: true,
      accessLevel,
      reason: 'GRANTED',
      message: `Access granted with level ${accessLevel}`,
      user: { id: user.Id, email: user.Email, name: user.Name },
      agent: { id: agent.Id, code: agent.Code, name: agent.Name },
    })
  },
})

/* ── DELETE /api/mgmt/api-keys/{id} ────────────────────── */

app.http('revokeApiKey', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'mgmt/api-keys/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    const affected = await execute(
      `UPDATE ApiKey SET IsActive = 0 WHERE Id = @id AND IsActive = 1`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )

    if (affected === 0) return json({ error: 'API key not found or already revoked' }, 404)

    return json({ success: true, message: 'API key revoked' })
  },
})
