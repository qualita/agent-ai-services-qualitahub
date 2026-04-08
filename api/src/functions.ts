import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { query, TYPES } from './db.js'
import { getBlobSasUrl, downloadBlob } from './storage.js'
import './admin.js'
import './write-api.js'

/** Parse comma-separated agent IDs from query param, returning validated positive integers */
function parseAgentIds(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
}

/** Build visibility WHERE clause from fullAgentIds, ownAgentIds + invokedBy params */
function buildVisibilityFilter(req: HttpRequest): { where: string; params: { name: string; type: unknown; value: unknown }[] } {
  const fullIds = parseAgentIds(req.query.get('fullAgentIds'))
  const ownIds = parseAgentIds(req.query.get('ownAgentIds'))
  const invokedBy = req.query.get('invokedBy') || ''

  // Legacy support: if only agentIds is set, treat as FULL
  const legacyIds = parseAgentIds(req.query.get('agentIds'))

  if (fullIds.length === 0 && ownIds.length === 0 && legacyIds.length === 0) {
    return { where: '', params: [] }
  }

  if (legacyIds.length > 0 && fullIds.length === 0 && ownIds.length === 0) {
    return { where: ` AND e.AgentId IN (${legacyIds.join(',')})`, params: [] }
  }

  const parts: string[] = []
  if (fullIds.length > 0) {
    parts.push(`e.AgentId IN (${fullIds.join(',')})`)
  }
  if (ownIds.length > 0 && invokedBy) {
    parts.push(`(e.AgentId IN (${ownIds.join(',')}) AND e.InvokedBy = @visInvokedBy)`)
  }

  if (parts.length === 0) return { where: '', params: [] }

  return {
    where: ` AND (${parts.join(' OR ')})`,
    params: ownIds.length > 0 && invokedBy
      ? [{ name: 'visInvokedBy', type: TYPES.NVarChar, value: invokedBy }]
      : [],
  }
}

/** Build agent filter for agents list (just filter by all accessible agent IDs) */
function buildAgentListFilter(req: HttpRequest): string {
  const fullIds = parseAgentIds(req.query.get('fullAgentIds'))
  const ownIds = parseAgentIds(req.query.get('ownAgentIds'))
  const legacyIds = parseAgentIds(req.query.get('agentIds'))

  const allIds = [...new Set([...fullIds, ...ownIds, ...legacyIds])]
  if (allIds.length === 0) return ''
  return ` WHERE Id IN (${allIds.join(',')})`
}

/* ──────────────────────────────────────────
   GET /api/agents-summary
   ────────────────────────────────────────── */
app.http('agentsSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agents-summary',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const vis = buildVisibilityFilter(req)
    const visAnd = vis.where || ''

    const rows = await query(
      `SELECT a.Id AS agentId, a.Name AS name, a.Description AS description,
         COUNT(e.Id) AS totalExecutions,
         SUM(CASE WHEN sc.Code = 'SUCCESS' THEN 1 ELSE 0 END) AS successCount,
         SUM(CASE WHEN sc.Code = 'FAILED' THEN 1 ELSE 0 END) AS failedCount,
         SUM(CASE WHEN sc.Code = 'RUNNING' THEN 1 ELSE 0 END) AS runningCount,
         MAX(e.StartTime) AS lastExecution
       FROM Agent a
       LEFT JOIN Execution e ON a.Id = e.AgentId
       LEFT JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       WHERE 1=1${visAnd}
       GROUP BY a.Id, a.Name, a.Description
       ORDER BY a.Name`,
      vis.params
    )

    return json(rows.map((r) => ({
      agentId: r.agentId,
      name: r.name,
      description: r.description,
      totalExecutions: r.totalExecutions ?? 0,
      successCount: r.successCount ?? 0,
      failedCount: r.failedCount ?? 0,
      runningCount: r.runningCount ?? 0,
      lastExecution: r.lastExecution,
    })))
  },
})

/* ──────────────────────────────────────────
   GET /api/dashboard/stats
   ────────────────────────────────────────── */
app.http('dashboardStats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/stats',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    await timeoutStuckExecutions()

    const vis = buildVisibilityFilter(req)
    const visWhere = vis.where ? ` WHERE 1=1${vis.where}` : ''
    const visAnd = vis.where || ''

    const totalRows = await query(
      `SELECT COUNT(*) AS cnt FROM Execution e${visWhere}`,
      vis.params
    )
    const totalExecutions = (totalRows[0]?.cnt as number) ?? 0

    const statusRows = await query(
      `SELECT sc.Code, COUNT(*) AS cnt
       FROM Execution e
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       WHERE 1=1${visAnd}
       GROUP BY sc.Code`,
      vis.params
    )
    const statusMap: Record<string, number> = {}
    for (const r of statusRows) {
      statusMap[r.Code as string] = r.cnt as number
    }

    const avgRows = await query(
      `SELECT AVG(DATEDIFF(SECOND, e.StartTime, e.FinishTime)) AS avgSec
       FROM Execution e
       WHERE e.FinishTime IS NOT NULL AND e.StartTime IS NOT NULL${visAnd}`,
      vis.params
    )
    const avgDurationSeconds = (avgRows[0]?.avgSec as number) ?? 0

    const byAgentRows = await query(
      `SELECT a.Id AS agentId, a.Name AS agentName, COUNT(*) AS cnt
       FROM Execution e
       JOIN Agent a ON e.AgentId = a.Id
       WHERE 1=1${visAnd}
       GROUP BY a.Id, a.Name
       ORDER BY cnt DESC`,
      vis.params
    )

    const trendRows = await query(
      `SELECT CONVERT(date, e.StartTime) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN sc.Code = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN sc.Code = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM Execution e
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       WHERE e.StartTime >= DATEADD(DAY, -15, GETUTCDATE())${visAnd}
       GROUP BY CONVERT(date, e.StartTime)
       ORDER BY day`,
      vis.params
    )

    return json({
      totalExecutions,
      successCount: statusMap['SUCCESS'] ?? 0,
      failedCount: statusMap['FAILED'] ?? 0,
      runningCount: statusMap['RUNNING'] ?? 0,
      avgDurationSeconds,
      executionsByAgent: byAgentRows.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        count: r.cnt,
      })),
      executionTrend: trendRows.map((r) => ({
        date: (r.day as Date).toISOString().slice(0, 10),
        total: r.total as number,
        success: r.success as number,
        failed: r.failed as number,
      })),
    })
  },
})

/* ──────────────────────────────────────────
   GET /api/agents
   ────────────────────────────────────────── */
app.http('agents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agents',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const agentFilter = buildAgentListFilter(req)
    const rows = await query(`
      SELECT Id, Code, Name, Description, IsActive, CreatedAtUtc
      FROM Agent${agentFilter}
      ORDER BY Name
    `)
    return json(
      rows.map((r) => ({
        agentId: r.Id,
        code: r.Code,
        name: r.Name,
        description: r.Description,
        isActive: r.IsActive,
        createdAt: r.CreatedAtUtc,
        categoryName: null,
        version: null,
        configJson: null,
      }))
    )
  },
})

/* ──────────────────────────────────────────
   GET /api/agents/{id}
   ────────────────────────────────────────── */
app.http('agentById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agents/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    const rows = await query(
      `SELECT Id, Code, Name, Description, IsActive, CreatedAtUtc FROM Agent WHERE Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )
    if (rows.length === 0) return json({ error: 'Not found' }, 404)

    const r = rows[0]
    return json({
      agentId: r.Id,
      code: r.Code,
      name: r.Name,
      description: r.Description,
      isActive: r.IsActive,
      createdAt: r.CreatedAtUtc,
      categoryName: null,
      version: null,
      configJson: null,
    })
  },
})

/* ──────────────────────────────────────────
   GET /api/executions?page=1&pageSize=15&status=SUCCESS&search=...&agentId=...
   ────────────────────────────────────────── */
app.http('executions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'executions',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    await timeoutStuckExecutions()

    const page = Math.max(1, Number(req.query.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.get('pageSize') || '15')))
    const offset = (page - 1) * pageSize
    const statusFilter = req.query.get('status') || ''
    const search = req.query.get('search') || ''
    const agentId = req.query.get('agentId') || ''
    const dateFrom = req.query.get('dateFrom') || ''
    const dateTo = req.query.get('dateTo') || ''

    const vis = buildVisibilityFilter(req)

    let where = 'WHERE 1=1'
    const params: { name: string; type: unknown; value: unknown }[] = [...vis.params]

    if (vis.where) {
      where += vis.where
    }

    if (statusFilter) {
      where += ' AND sc.Code = @status'
      params.push({ name: 'status', type: TYPES.NVarChar, value: statusFilter })
    }
    if (search) {
      where += ' AND (a.Name LIKE @search OR e.TriggerSource LIKE @search OR e.InvokedBy LIKE @search)'
      params.push({ name: 'search', type: TYPES.NVarChar, value: `%${search}%` })
    }
    if (agentId) {
      where += ' AND e.AgentId = @agentId'
      params.push({ name: 'agentId', type: TYPES.BigInt, value: Number(agentId) })
    }
    if (dateFrom) {
      where += ' AND e.StartTime >= @dateFrom'
      params.push({ name: 'dateFrom', type: TYPES.DateTime, value: new Date(dateFrom) })
    }
    if (dateTo) {
      where += ' AND e.StartTime <= @dateTo'
      params.push({ name: 'dateTo', type: TYPES.DateTime, value: new Date(dateTo + 'T23:59:59.999Z') })
    }

    const countRows = await query(
      `SELECT COUNT(*) AS cnt
       FROM Execution e
       JOIN Agent a ON e.AgentId = a.Id
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       ${where}`,
      params
    )
    const total = (countRows[0]?.cnt as number) ?? 0

    const dataParams = [
      ...params,
      { name: 'offset', type: TYPES.Int, value: offset },
      { name: 'pageSize', type: TYPES.Int, value: pageSize },
    ]
    const rows = await query(
      `SELECT
         e.Id AS executionId,
         LOWER(CAST(e.ExecutionGuid AS NVARCHAR(36))) AS executionGuid,
         e.AgentId AS agentId,
         a.Name AS agentName,
         sc.Code AS status,
         e.TriggerSource AS triggerSource,
         e.InvokedBy AS invokedBy,
         e.StartTime AS startTime,
         e.FinishTime AS finishTime,
         DATEDIFF(SECOND, e.StartTime, e.FinishTime) AS durationSeconds,
         e.ErrorMessage AS errorMessage,
         (SELECT COUNT(*) FROM ExecutionStep es WHERE es.ExecutionId = e.Id) AS stepCount,
         (SELECT COUNT(*) FROM Input i WHERE i.ExecutionId = e.Id) AS inputCount,
         (SELECT COUNT(*) FROM Output o WHERE o.ExecutionId = e.Id) AS outputCount
       FROM Execution e
       JOIN Agent a ON e.AgentId = a.Id
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       ${where}
       ORDER BY e.StartTime DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
      dataParams
    )

    // Fetch input/output summaries for each execution
    const execIds = rows.map((r) => r.executionId as number)
    let inputSummaries: Record<number, { inputId: number; inputType: string; fileName: string | null; mimeType: string | null; filePath: string | null }[]> = {}
    let outputSummaries: Record<number, { outputId: number; outputType: string; fileName: string | null; mimeType: string | null; filePath: string | null }[]> = {}

    if (execIds.length > 0) {
      const idList = execIds.join(',')
      const inputRows = await query(
        `SELECT i.Id AS inputId, i.ExecutionId, i.InputType AS inputType, i.FileName, i.MimeType, i.FilePath
         FROM Input i
         WHERE i.ExecutionId IN (${idList})
         ORDER BY i.ReceivedTime`
      )
      for (const r of inputRows) {
        const eid = r.ExecutionId as number
        if (!inputSummaries[eid]) inputSummaries[eid] = []
        inputSummaries[eid].push({ inputId: r.inputId as number, inputType: r.inputType as string, fileName: r.FileName as string | null, mimeType: r.MimeType as string | null, filePath: r.FilePath as string | null })
      }

      const outputRows = await query(
        `SELECT o.Id AS outputId, o.ExecutionId, o.OutputType AS outputType, o.FileName, o.MimeType, o.FilePath
         FROM Output o
         WHERE o.ExecutionId IN (${idList})
         ORDER BY o.CreatedAtUtc`
      )
      for (const r of outputRows) {
        const eid = r.ExecutionId as number
        if (!outputSummaries[eid]) outputSummaries[eid] = []
        outputSummaries[eid].push({ outputId: r.outputId as number, outputType: r.outputType as string, fileName: r.FileName as string | null, mimeType: r.MimeType as string | null, filePath: r.FilePath as string | null })
      }

    }

    return json({
      items: rows.map((r) => {
        const eid = r.executionId as number
        return {
          executionId: eid,
          executionGuid: r.executionGuid,
          agentId: r.agentId,
          agentName: r.agentName,
          status: r.status,
          triggerSource: r.triggerSource,
          invokedBy: r.invokedBy,
          startTime: r.startTime,
          finishTime: r.finishTime,
          durationSeconds: r.durationSeconds,
          stepCount: r.stepCount,
          errorMessage: r.errorMessage ?? null,
          inputCount: r.inputCount,
          outputCount: r.outputCount,
          inputs: inputSummaries[eid] ?? [],
          outputs: outputSummaries[eid] ?? [],
        }
      }),
      total,
    })
  },
})

/* ──────────────────────────────────────────
   GET /api/executions/{id}
   ────────────────────────────────────────── */
app.http('executionById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'executions/{id}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = Number(req.params.id)
    if (isNaN(id)) return json({ error: 'Invalid id' }, 400)

    const execRows = await query(
      `SELECT
         e.Id AS executionId,
         LOWER(CAST(e.ExecutionGuid AS NVARCHAR(36))) AS executionGuid,
         e.AgentId AS agentId,
         a.Name AS agentName,
         sc.Code AS status,
         e.TriggerSource AS triggerSource,
         e.InvokedBy AS invokedBy,
         e.StartTime AS startTime,
         e.FinishTime AS finishTime,
         DATEDIFF(SECOND, e.StartTime, e.FinishTime) AS durationSeconds,
         e.ErrorMessage AS errorMessage
       FROM Execution e
       JOIN Agent a ON e.AgentId = a.Id
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       WHERE e.Id = @id`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )
    if (execRows.length === 0) return json({ error: 'Not found' }, 404)

    const exec = execRows[0]

    const stepRows = await query(
      `SELECT
         es.Id AS stepId,
         es.StepOrder AS stepOrder,
         es.StepName AS stepName,
         sc.Code AS status,
         es.Description AS description,
         es.StartTime AS startTime,
         es.FinishTime AS finishTime,
         CAST(es.DurationMs AS FLOAT) / 1000.0 AS durationSeconds,
         es.ErrorMessage AS errorMessage
       FROM ExecutionStep es
       INNER JOIN StatusCatalog sc ON es.StatusId = sc.Id
       WHERE es.ExecutionId = @id
       ORDER BY es.StepOrder`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )

    const inputRows = await query(
      `SELECT
         i.Id AS inputId,
         i.InputType AS inputType,
         i.ContentText AS contentText,
         i.FileName AS fileName,
         i.MimeType AS mimeType,
         i.FilePath AS filePath,
         i.ReceivedTime AS receivedAt
       FROM Input i
       WHERE i.ExecutionId = @id
       ORDER BY i.ReceivedTime`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )

    const outputRows = await query(
      `SELECT
         o.Id AS outputId,
         o.OutputType AS outputType,
         o.ContentText AS contentText,
         o.FileName AS fileName,
         o.MimeType AS mimeType,
         o.FilePath AS filePath,
         o.CreatedAtUtc AS generatedAt
       FROM Output o
       WHERE o.ExecutionId = @id
       ORDER BY o.CreatedAtUtc`,
      [{ name: 'id', type: TYPES.BigInt, value: id }]
    )

    return json({
      executionId: exec.executionId,
      executionGuid: exec.executionGuid,
      agentId: exec.agentId,
      agentName: exec.agentName,
      status: exec.status,
      triggerSource: exec.triggerSource,
      invokedBy: exec.invokedBy,
      startTime: exec.startTime,
      finishTime: exec.finishTime,
      durationSeconds: exec.durationSeconds,
      stepCount: stepRows.length,
      errorMessage: exec.errorMessage ?? null,
      steps: stepRows.map((s) => ({
        stepId: s.stepId,
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        status: s.status,
        description: s.description,
        startTime: s.startTime,
        finishTime: s.finishTime,
        durationSeconds: s.durationSeconds,
        errorMessage: s.errorMessage,
      })),
      inputs: inputRows.map((i) => ({
        inputId: i.inputId,
        inputType: i.inputType,
        contentText: i.contentText,
        fileName: i.fileName,
        mimeType: i.mimeType,
        filePath: i.filePath,
        receivedAt: i.receivedAt,
      })),
      outputs: outputRows.map((o) => ({
        outputId: o.outputId,
        outputType: o.outputType,
        contentText: o.contentText,
        fileName: o.fileName,
        mimeType: o.mimeType,
        filePath: o.filePath,
        generatedAt: o.generatedAt,
      })),
    })
  },
})

/* ──────────────────────────────────────────
   File download (SAS URL)
   ────────────────────────────────────────── */
app.http('fileSas', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files/sas',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blobPath = req.query.get('path')
    const downloadName = req.query.get('filename') || undefined
    const inline = req.query.get('mode') === 'inline'
    if (!blobPath) {
      return json({ error: 'Missing path query parameter' }, 400)
    }

    // Validate that the filePath exists in Input or Output tables
    const rows = await query(
      `SELECT TOP 1 StorageProvider AS providerCode
       FROM (
         SELECT StorageProvider FROM Input WHERE FilePath = @path
         UNION ALL
         SELECT StorageProvider FROM Output WHERE FilePath = @path
       ) f`,
      [{ name: 'path', type: TYPES.NVarChar, value: blobPath }]
    )

    if (rows.length === 0) {
      return json({ error: 'File not found' }, 404)
    }

    const providerCode = rows[0].providerCode as string
    if (providerCode !== 'AZURE_BLOB') {
      return json({ error: `Storage provider '${providerCode}' is not supported for direct download` }, 400)
    }

    try {
      const sasUrl = getBlobSasUrl(blobPath, downloadName, inline)
      return json({ url: sasUrl })
    } catch (err: any) {
      return json({ error: 'Failed to generate download URL' }, 500)
    }
  },
})

/* ──────────────────────────────────────────
   File content proxy (avoids CORS on Blob Storage)
   ────────────────────────────────────────── */
app.http('fileContent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files/content',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blobPath = req.query.get('path')
    const isDownload = req.query.get('download') === '1'
    const downloadName = req.query.get('filename') || undefined
    if (!blobPath) {
      return json({ error: 'Missing path query parameter' }, 400)
    }

    const rows = await query(
      `SELECT TOP 1 StorageProvider AS providerCode, MimeType AS mimeType
       FROM (
         SELECT StorageProvider, MimeType FROM Input WHERE FilePath = @path
         UNION ALL
         SELECT StorageProvider, MimeType FROM Output WHERE FilePath = @path
       ) f`,
      [{ name: 'path', type: TYPES.NVarChar, value: blobPath }]
    )

    if (rows.length === 0) {
      return json({ error: 'File not found' }, 404)
    }

    const providerCode = rows[0].providerCode as string
    if (providerCode !== 'AZURE_BLOB') {
      return json({ error: `Storage provider '${providerCode}' is not supported` }, 400)
    }

    try {
      const content = await downloadBlob(blobPath)
      const mimeType = (rows[0].mimeType as string) || 'application/octet-stream'
      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=300',
      }
      if (isDownload && downloadName) {
        headers['Content-Disposition'] = `attachment; filename="${downloadName.replace(/"/g, '\\"')}"`
      } else {
        headers['Content-Disposition'] = 'inline'
      }

      return { status: 200, headers, body: content }
    } catch (err: any) {
      return json({ error: 'Failed to fetch file content' }, 500)
    }
  },
})

/* ──────────────────────────────────────────
   Timeout stuck executions (2.5 hours)
   ────────────────────────────────────────── */
let lastTimeoutCheck = 0
const TIMEOUT_CHECK_INTERVAL = 5 * 60 * 1000 // check at most every 5 min

async function timeoutStuckExecutions(): Promise<void> {
  const now = Date.now()
  if (now - lastTimeoutCheck < TIMEOUT_CHECK_INTERVAL) return
  lastTimeoutCheck = now

  try {
    // Update executions stuck in RUNNING for > 2.5 hours
    await query(
      `UPDATE e
       SET e.OverallStatus = (SELECT Id FROM StatusCatalog WHERE Code = 'FAILED'),
           e.ErrorMessage = 'Timeout: la ejecución excedió el límite de 2 horas y media',
           e.FinishTime = GETUTCDATE(),
           e.UpdatedAtUtc = GETUTCDATE(),
           e.UpdatedBy = 'system-timeout'
       FROM Execution e
       JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
       WHERE sc.Code = 'RUNNING'
         AND e.StartTime < DATEADD(MINUTE, -150, GETUTCDATE())`
    )

    // Also timeout their execution steps that are still RUNNING
    await query(
      `UPDATE es
       SET es.StatusId = (SELECT Id FROM StatusCatalog WHERE Code = 'FAILED'),
           es.ErrorMessage = 'Timeout: la ejecución excedió el límite de 2 horas y media',
           es.EndTime = GETUTCDATE(),
           es.UpdatedAtUtc = GETUTCDATE(),
           es.UpdatedBy = 'system-timeout'
       FROM ExecutionStep es
       JOIN Execution e ON es.ExecutionId = e.Id
       JOIN StatusCatalog sc_step ON es.StatusId = sc_step.Id
       JOIN StatusCatalog sc_exec ON e.OverallStatus = sc_exec.Id
       WHERE sc_step.Code = 'RUNNING'
         AND sc_exec.Code = 'FAILED'
         AND e.StartTime < DATEADD(MINUTE, -150, GETUTCDATE())`
    )
  } catch {
    // Timeout check is best-effort; don't break the main request
  }
}

/* ──────────────────────────────────────────
   Helpers
   ────────────────────────────────────────── */
function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}


