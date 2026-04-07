const { execute, query } = require('./dist/db.js');

(async () => {
  // 1. Create ApiKey table
  await execute(`
    CREATE TABLE ApiKey (
      Id BIGINT IDENTITY(1,1) PRIMARY KEY,
      AgentId BIGINT NOT NULL,
      KeyHash NVARCHAR(128) NOT NULL,
      KeyPrefix NVARCHAR(10) NOT NULL,
      Name NVARCHAR(200) NOT NULL,
      IsActive BIT NOT NULL DEFAULT 1,
      CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      ExpiresAt DATETIME2 NULL,
      LastUsedAt DATETIME2 NULL,
      CreatedBy NVARCHAR(200) NULL,
      CONSTRAINT FK_ApiKey_Agent FOREIGN KEY (AgentId) REFERENCES Agent(Id),
      CONSTRAINT UQ_ApiKey_KeyHash UNIQUE (KeyHash)
    )
  `);
  console.log('ApiKey table created');

  // 2. Create filtered index for fast lookups
  await execute(`CREATE INDEX IX_ApiKey_Active ON ApiKey(KeyHash) WHERE IsActive = 1`);
  console.log('Index created');

  // 3. Generate API keys for existing agents
  const crypto = require('crypto');
  const agents = await query(`SELECT Id, Code, Name FROM Agent`);
  console.log(`Found ${agents.length} agents`);

  for (const agent of agents) {
    const rawKey = `aais_${agent.Code}_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

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
