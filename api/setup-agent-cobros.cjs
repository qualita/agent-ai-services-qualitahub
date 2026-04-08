/**
 * Setup script: Agente Cobros Europastry
 * ----------------------------------------
 * 1. Inserts the new agent (AGT-0005) into the Agent table
 * 2. Generates an API key for the agent
 *
 * Run from /api:  node setup-agent-cobros.cjs
 */
const { execute, query } = require('./dist/db.js');
const crypto = require('crypto');

const AGENT_CODE = 'AGT-0005';
const AGENT_NAME = 'Agente Cobros';
const AGENT_DESCRIPTION =
  'Procesa cobros bancarios de Europastry. Recibe email con adjunto (Excel/PDF) de pago, extrae facturas y abonos mediante IA (Claude), y genera archivos Excel (pagos.xlsx, facturas.xlsx) para importar al ERP. Pipeline de 3 fases: Preprocessing, Extracción IA, Postprocessing.';

(async () => {
  // Check if agent already exists
  const existing = await query(
    `SELECT Id, Code FROM Agent WHERE Code = @code`,
    [{ name: 'code', type: require('tedious').TYPES.NVarChar, value: AGENT_CODE }]
  );

  let agentId;

  if (existing.length > 0) {
    agentId = existing[0].Id;
    console.log(`Agent "${AGENT_CODE}" already exists with Id=${agentId}. Skipping insert.`);
  } else {
    const result = await query(
      `INSERT INTO Agent (Code, Name, Description, IsActive, CreatedAtUtc, CreatedBy, UpdatedAtUtc, UpdatedBy)
       OUTPUT INSERTED.Id
       VALUES (@code, @name, @description, 1, SYSUTCDATETIME(), 'setup-script', SYSUTCDATETIME(), 'setup-script')`,
      [
        { name: 'code', type: require('tedious').TYPES.NVarChar, value: AGENT_CODE },
        { name: 'name', type: require('tedious').TYPES.NVarChar, value: AGENT_NAME },
        { name: 'description', type: require('tedious').TYPES.NVarChar, value: AGENT_DESCRIPTION },
      ]
    );
    agentId = result[0].Id;
    console.log(`Agent created: "${AGENT_NAME}" (${AGENT_CODE}) → Id=${agentId}`);
  }

  // Generate API Key
  const rawKey = `aais_${AGENT_CODE}_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 14);

  await execute(
    `INSERT INTO ApiKey (AgentId, KeyHash, KeyPrefix, Name, IsActive, CreatedAtUtc, CreatedBy)
     VALUES (@agentId, @keyHash, @keyPrefix, @name, 1, SYSUTCDATETIME(), 'setup-script')`,
    [
      { name: 'agentId', type: require('tedious').TYPES.BigInt, value: agentId },
      { name: 'keyHash', type: require('tedious').TYPES.NVarChar, value: keyHash },
      { name: 'keyPrefix', type: require('tedious').TYPES.NVarChar, value: keyPrefix },
      { name: 'name', type: require('tedious').TYPES.NVarChar, value: `Default key for ${AGENT_NAME}` },
    ]
  );

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  API KEY GENERATED — SAVE IT NOW (cannot be retrieved later)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Agent:    ${AGENT_NAME} (${AGENT_CODE})`);
  console.log(`  Agent Id: ${agentId}`);
  console.log(`  API Key:  ${rawKey}`);
  console.log(`  Prefix:   ${keyPrefix}`);
  console.log('════════════════════════════════════════════════════════════\n');
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
