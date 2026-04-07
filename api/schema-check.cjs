const { query } = require('./dist/db.js');

(async () => {
  const tables = ['Execution', 'ExecutionStep', 'Input', 'Output', 'StatusCatalog'];
  for (const t of tables) {
    const cols = await query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH 
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${t}' ORDER BY ORDINAL_POSITION`
    );
    console.log(`\n=== ${t} ===`);
    for (const c of cols) {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len} ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }
  }

  const statuses = await query('SELECT Id, Code, Name FROM StatusCatalog ORDER BY Id');
  console.log('\n=== StatusCatalog rows ===');
  console.log(JSON.stringify(statuses, null, 2));
})().catch(e => console.error(e.message));
