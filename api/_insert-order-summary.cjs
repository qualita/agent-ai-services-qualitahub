const {Connection,Request,TYPES} = require('tedious');
const conn = new Connection({
  server:'sqlserver-agent-ai-services-qualitahub.database.windows.net',
  authentication:{type:'default',options:{userName:'sqladmin',password:'DmMxiIoy4etJ3s2B!#2026'}},
  options:{database:'db-agent-ai-services-qualitahub',encrypt:true,trustServerCertificate:false}
});

function runQuery(sql, params) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = new Request(sql, (err) => {
      if (err) reject(err);
      else resolve(rows);
    });
    if (params) {
      params.forEach(p => req.addParameter(p.name, p.type, p.value));
    }
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
    // Execution 1: orderNumber=12402, steps show CIF B65347270, PO PO200003, cliente AN8=10 INTELEKTA, 4 líneas
    const summary1 = JSON.stringify({
      numero_pedido: 12402,
      tipo_pedido: "SO",
      compania: "00001",
      cliente: "INTELEKTA INNOVATION SOLUTION SL.",
      cliente_an8: 10,
      po_cliente: "PO200003",
      cif_cliente: "B65347270",
      total_lineas: 4,
      warnings: []
    });

    await runQuery(
      `INSERT INTO [Output] (ExecutionId, OutputType, FileName, MimeType, FilePath, ContentText, StorageProvider, CreatedAtUtc, CreatedBy)
       VALUES (@eid, 'ORDER_SUMMARY', 'order_summary.json', 'application/json', NULL, @content, 'INLINE', SYSUTCDATETIME(), 'migration')`,
      [
        { name: 'eid', type: TYPES.BigInt, value: 1 },
        { name: 'content', type: TYPES.NVarChar, value: summary1 }
      ]
    );
    console.log('Inserted ORDER_SUMMARY for ExecutionId=1');

    // Execution 2: orderNumber=12403, same client
    const summary2 = JSON.stringify({
      numero_pedido: 12403,
      tipo_pedido: "SO",
      compania: "00001",
      cliente: "INTELEKTA INNOVATION SOLUTION SL.",
      cliente_an8: 10,
      po_cliente: "PO200002",
      cif_cliente: "B65347270",
      total_lineas: 4,
      warnings: []
    });

    await runQuery(
      `INSERT INTO [Output] (ExecutionId, OutputType, FileName, MimeType, FilePath, ContentText, StorageProvider, CreatedAtUtc, CreatedBy)
       VALUES (@eid, 'ORDER_SUMMARY', 'order_summary.json', 'application/json', NULL, @content, 'INLINE', SYSUTCDATETIME(), 'migration')`,
      [
        { name: 'eid', type: TYPES.BigInt, value: 2 },
        { name: 'content', type: TYPES.NVarChar, value: summary2 }
      ]
    );
    console.log('Inserted ORDER_SUMMARY for ExecutionId=2');

    // Verify
    const verify = await runQuery("SELECT Id, ExecutionId, OutputType, ContentText FROM [Output] WHERE OutputType = 'ORDER_SUMMARY'");
    console.log('\nVerification:');
    console.log(JSON.stringify(verify, null, 2));

    conn.close();
  } catch(e) {
    console.error(e.message);
    conn.close();
  }
});
conn.connect();
