const { Connection, Request } = require('tedious');
const c = new Connection({
  server: 'sqlserver-agent-ai-services-qualitahub.database.windows.net',
  authentication: { type: 'default', options: { userName: 'sqladmin', password: '<SET_NEW_PASSWORD>' } },
  options: { database: 'db-agent-ai-services-qualitahub', encrypt: true, trustServerCertificate: false, port: 1433, connectTimeout: 15000, requestTimeout: 30000 }
});

c.on('connect', (err) => {
  if (err) { console.error(err.message); process.exit(1); }

  const sql = `
    SELECT
      e.Id,
      LOWER(CAST(e.ExecutionGuid AS NVARCHAR(36))) AS Guid,
      a.Name AS Agent,
      sc.Code AS Status,
      e.TriggerSource,
      e.InvokedBy,
      e.StartTime,
      e.FinishTime,
      DATEDIFF(SECOND, e.StartTime, e.FinishTime) AS DurationSec,
      e.ErrorMessage,
      (SELECT COUNT(*) FROM ExecutionStep es WHERE es.ExecutionId = e.Id) AS Steps,
      (SELECT COUNT(*) FROM Input i WHERE i.ExecutionId = e.Id) AS Inputs,
      (SELECT COUNT(*) FROM Output o WHERE o.ExecutionId = e.Id) AS Outputs
    FROM Execution e
    JOIN Agent a ON e.AgentId = a.Id
    JOIN StatusCatalog sc ON e.OverallStatus = sc.Id
    ORDER BY e.StartTime DESC`;

  const rows = [];
  const req = new Request(sql, (err) => {
    if (err) { console.error(err.message); c.close(); process.exit(1); }
    // Print as table
    const fmt = (v, w) => String(v ?? '').slice(0, w).padEnd(w);
    console.log(`${fmt('Id',4)} ${fmt('Status',10)} ${fmt('Trigger',8)} ${fmt('InvokedBy',25)} ${fmt('Start',20)} ${fmt('Finish',20)} ${fmt('Dur',6)} ${fmt('Steps',5)} ${fmt('In',3)} ${fmt('Out',3)} ${fmt('Error',60)}`);
    console.log('-'.repeat(170));
    rows.forEach(r => {
      const start = r.StartTime ? new Date(r.StartTime).toISOString().slice(0, 19).replace('T', ' ') : '';
      const finish = r.FinishTime ? new Date(r.FinishTime).toISOString().slice(0, 19).replace('T', ' ') : '';
      const dur = r.DurationSec != null ? `${r.DurationSec}s` : '';
      console.log(`${fmt(r.Id,4)} ${fmt(r.Status,10)} ${fmt(r.TriggerSource,8)} ${fmt(r.InvokedBy,25)} ${fmt(start,20)} ${fmt(finish,20)} ${fmt(dur,6)} ${fmt(r.Steps,5)} ${fmt(r.Inputs,3)} ${fmt(r.Outputs,3)} ${fmt(r.ErrorMessage,60)}`);
    });
    console.log(`\nTotal: ${rows.length} executions`);
    c.close();
  });
  req.on('row', (cols) => {
    const row = {};
    cols.forEach(col => { row[col.metadata.colName] = col.value; });
    rows.push(row);
  });
  c.execSql(req);
});

c.connect();
