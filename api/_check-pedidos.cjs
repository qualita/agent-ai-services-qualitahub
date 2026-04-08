const {Connection,Request} = require('tedious');
const conn = new Connection({
  server:'sqlserver-agent-ai-services-qualitahub.database.windows.net',
  authentication:{type:'default',options:{userName:'sqladmin',password:'DmMxiIoy4etJ3s2B!#2026'}},
  options:{database:'db-agent-ai-services-qualitahub',encrypt:true,trustServerCertificate:false}
});

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = new Request(sql, (err) => {
      if (err) reject(err);
      else resolve(rows);
    });
    req.on('row', cols => {
      const r = {};
      cols.forEach(c => r[c.metadata.colName] = c.value);
      rows.push(r);
    });
    conn.execSql(req);
  });
}

conn.on('connect', async (err) => {
  if (err) { console.error(err.message); process.exit(1); }
  try {
    // Full JSON output for a pedidos execution
    const jsonOutputs = await runQuery("SELECT o.Id, o.ExecutionId, o.OutputType, o.FileName, o.ContentText FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 1 AND o.OutputType = 'JSON'");
    console.log('=== JSON outputs for Pedidos ===');
    console.log(JSON.stringify(jsonOutputs, null, 2));

    // SUMMARY outputs
    const summaries = await runQuery("SELECT o.Id, o.ExecutionId, o.OutputType, o.FileName, o.ContentText FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 1 AND o.OutputType = 'SUMMARY'");
    console.log('\n=== SUMMARY outputs for Pedidos ===');
    console.log(JSON.stringify(summaries, null, 2));

    // Input types for Pedidos
    const inputs = await runQuery("SELECT DISTINCT i.InputType FROM [Input] i INNER JOIN Execution e ON i.ExecutionId = e.Id WHERE e.AgentId = 1");
    console.log('\n=== Input types for Pedidos ===');
    console.log(JSON.stringify(inputs, null, 2));

    // Sample input
    const sampleInputs = await runQuery("SELECT TOP 3 i.Id, i.InputType, i.FileName, i.MimeType, LEFT(i.ContentText, 500) as ContentText FROM [Input] i INNER JOIN Execution e ON i.ExecutionId = e.Id WHERE e.AgentId = 1 ORDER BY i.Id DESC");
    console.log('\n=== Sample inputs for Pedidos ===');
    console.log(JSON.stringify(sampleInputs, null, 2));

    // Look at the EMAIL_REPLY_SUMMARY for cobros (reference)
    const cobrosSum = await runQuery("SELECT TOP 1 o.ContentText FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 2 AND o.OutputType = 'EMAIL_REPLY_SUMMARY'");
    console.log('\n=== EMAIL_REPLY_SUMMARY sample for Cobros (reference) ===');
    console.log(JSON.stringify(cobrosSum, null, 2));

    // Execution steps for Pedidos
    const steps = await runQuery("SELECT TOP 10 es.Id, es.StepName, es.StatusId, es.Description FROM ExecutionStep es INNER JOIN Execution e ON es.ExecutionId = e.Id WHERE e.AgentId = 1 ORDER BY es.Id");
    console.log('\n=== Steps for Pedidos ===');
    console.log(JSON.stringify(steps, null, 2));

    conn.close();
  } catch(e) {
    console.error(e.message);
    conn.close();
  }
});
conn.connect();
