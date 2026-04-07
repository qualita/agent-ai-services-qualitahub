const { execute, query } = require('./dist/db.js');
const crypto = require('crypto');

(async () => {
  const agents = await query('SELECT Id, Code, Name FROM Agent');
  console.log(`Found ${agents.length} agents`);

  for (const agent of agents) {
    const rawKey = `aais_${agent.Code}_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 14);

    await execute(
      `INSERT INTO ApiKey (AgentId, KeyHash, KeyPrefix, Name, IsActive, CreatedBy)
       VALUES (@agentId, @keyHash, @keyPrefix, @name, 1, 'system-setup')`,
      [
        { name: 'agentId', type: require('tedious').TYPES.BigInt, value: agent.Id },
        { name: 'keyHash', type: require('tedious').TYPES.NVarChar, value: keyHash },
        { name: 'keyPrefix', type: require('tedious').TYPES.NVarChar, value: keyPrefix },
        { name: 'name', type: require('tedious').TYPES.NVarChar, value: `Default key for ${agent.Name}` },
      ]
    );
    console.log(`Agent "${agent.Name}" (${agent.Code}): ${rawKey}`);
  }

  console.log('\nDone! Save these API keys - they cannot be retrieved again.');
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
