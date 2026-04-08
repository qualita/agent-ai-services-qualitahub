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
    // Output table columns
    const cols = await runQuery("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Output' ORDER BY ORDINAL_POSITION");
    console.log('=== Output table columns ===');
    console.log(JSON.stringify(cols, null, 2));

    // Distinct output types for Pedidos agent (Id=1)
    const types1 = await runQuery("SELECT DISTINCT o.OutputType FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 1");
    console.log('\n=== Output types for Pedidos (AgentId=1) ===');
    console.log(JSON.stringify(types1, null, 2));

    // Distinct output types for Cobros agent (Id=2)
    const types2 = await runQuery("SELECT DISTINCT o.OutputType FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 2");
    console.log('\n=== Output types for Cobros (AgentId=2) ===');
    console.log(JSON.stringify(types2, null, 2));

    // Sample output records for Pedidos
    const samples = await runQuery("SELECT TOP 5 o.Id, o.OutputType, o.FileName, o.MimeType, LEFT(o.ContentText, 500) as ContentText FROM [Output] o INNER JOIN Execution e ON o.ExecutionId = e.Id WHERE e.AgentId = 1 ORDER BY o.Id DESC");
    console.log('\n=== Sample outputs for Pedidos (last 5) ===');
    console.log(JSON.stringify(samples, null, 2));

    conn.close();
  } catch(e) {
    console.error(e.message);
    conn.close();
  }
});
conn.connect();
