import { Connection, Request, TYPES } from 'tedious'

interface DbRow {
  [key: string]: unknown
}

interface ColumnMetadata {
  colName: string
}

interface TediousColumn {
  metadata: ColumnMetadata
  value: unknown
}

function getConnection(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const conn = new Connection({
      server: process.env.SQL_SERVER!,
      authentication: {
        type: 'default',
        options: {
          userName: process.env.SQL_USER!,
          password: process.env.SQL_PASSWORD!,
        },
      },
      options: {
        database: process.env.SQL_DATABASE!,
        encrypt: true,
        trustServerCertificate: false,
        port: 1433,
        connectTimeout: 15000,
        requestTimeout: 30000,
      },
    })

    conn.on('connect', (err) => {
      if (err) reject(err)
      else resolve(conn)
    })

    conn.connect()
  })
}

export async function query(sql: string, params?: { name: string; type: unknown; value: unknown }[]): Promise<DbRow[]> {
  const conn = await getConnection()
  return new Promise((resolve, reject) => {
    const rows: DbRow[] = []
    const request = new Request(sql, (err) => {
      conn.close()
      if (err) reject(err)
      else resolve(rows)
    })

    if (params) {
      for (const p of params) {
        request.addParameter(p.name, p.type as typeof TYPES[keyof typeof TYPES], p.value)
      }
    }

    request.on('row', (columns: TediousColumn[]) => {
      const row: DbRow = {}
      columns.forEach((col) => {
        row[col.metadata.colName] = col.value
      })
      rows.push(row)
    })

    conn.execSql(request)
  })
}

export async function queryScalar<T = unknown>(sql: string, params?: { name: string; type: unknown; value: unknown }[]): Promise<T | null> {
  const rows = await query(sql, params)
  if (rows.length === 0) return null
  const values = Object.values(rows[0])
  return (values[0] as T) ?? null
}

export async function execute(sql: string, params?: { name: string; type: unknown; value: unknown }[]): Promise<number> {
  const conn = await getConnection()
  return new Promise((resolve, reject) => {
    const request = new Request(sql, (err, rowCount) => {
      conn.close()
      if (err) reject(err)
      else resolve(rowCount ?? 0)
    })

    if (params) {
      for (const p of params) {
        request.addParameter(p.name, p.type as typeof TYPES[keyof typeof TYPES], p.value)
      }
    }

    conn.execSql(request)
  })
}

export { TYPES }
