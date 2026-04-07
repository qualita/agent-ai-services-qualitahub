const { query, execute, queryScalar } = require('./dist/db.js');
const { createHash } = require('crypto');
const { TYPES } = require('tedious');

// Simulate the API key validation + Write API flow against the real DB

const API_KEY = 'aais_AGT-0001_e39f58f257616785bde42f075db78f669c527d61cef6d740';

const STATUS_IDS = { PENDING: 1, RUNNING: 2, SUCCESS: 3, FAILED: 4, WARNING: 5, SKIPPED: 6 };

async function validateApiKey(rawKey) {
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const rows = await query(
    `SELECT k.Id, k.AgentId, k.ExpiresAt FROM ApiKey k WHERE k.KeyHash = @keyHash AND k.IsActive = 1`,
    [{ name: 'keyHash', type: TYPES.NVarChar, value: keyHash }]
  );
  if (rows.length === 0) return null;
  const key = rows[0];
  if (key.ExpiresAt && new Date(key.ExpiresAt) < new Date()) return null;
  return { agentId: key.AgentId, keyId: key.Id };
}

(async () => {
  // 1. Validate API key
  console.log('1. Validating API key...');
  const auth = await validateApiKey(API_KEY);
  if (!auth) { console.error('FAIL: API key validation failed'); return; }
  console.log(`   OK: agentId=${auth.agentId}, keyId=${auth.keyId}`);

  // 2. Simulate POST /api/executions/start
  console.log('\n2. Creating execution (start)...');
  const result = await query(
    `INSERT INTO Execution (AgentId, OverallStatus, StartTime, TriggerSource, InvokedBy, ExecutionGuid, CreatedAtUtc, CreatedBy)
     OUTPUT INSERTED.Id, LOWER(CAST(INSERTED.ExecutionGuid AS NVARCHAR(36))) AS ExecutionGuid
     VALUES (@agentId, @status, SYSUTCDATETIME(), @triggerSource, @invokedBy, NEWID(), SYSUTCDATETIME(), 'api-key')`,
    [
      { name: 'agentId', type: TYPES.BigInt, value: auth.agentId },
      { name: 'status', type: TYPES.BigInt, value: STATUS_IDS.RUNNING },
      { name: 'triggerSource', type: TYPES.NVarChar, value: 'API' },
      { name: 'invokedBy', type: TYPES.NVarChar, value: 'test-script' },
    ]
  );
  const executionId = result[0].Id;
  const executionGuid = result[0].ExecutionGuid;
  console.log(`   OK: executionId=${executionId}, guid=${executionGuid}`);

  // 3. Simulate POST /api/executions/{id}/steps
  console.log('\n3. Adding a step...');
  const stepResult = await query(
    `INSERT INTO ExecutionStep (ExecutionId, StepOrder, StepName, Status, Description, StartTime, FinishTime, DurationMs, ErrorMessage, CreatedAtUtc, CreatedBy)
     OUTPUT INSERTED.Id
     VALUES (@executionId, @stepOrder, @stepName, @status, @description, @startTime, @finishTime, @durationMs, @errorMessage, SYSUTCDATETIME(), 'api-key')`,
    [
      { name: 'executionId', type: TYPES.BigInt, value: executionId },
      { name: 'stepOrder', type: TYPES.Int, value: 1 },
      { name: 'stepName', type: TYPES.NVarChar, value: 'Data extraction' },
      { name: 'status', type: TYPES.NVarChar, value: 'SUCCESS' },
      { name: 'description', type: TYPES.NVarChar, value: 'Extracted 150 records from source' },
      { name: 'startTime', type: TYPES.DateTime2, value: new Date() },
      { name: 'finishTime', type: TYPES.DateTime2, value: new Date() },
      { name: 'durationMs', type: TYPES.Int, value: 3200 },
      { name: 'errorMessage', type: TYPES.NVarChar, value: null },
    ]
  );
  console.log(`   OK: stepId=${stepResult[0].Id}`);

  // 4. Simulate POST /api/executions/{id}/finish
  console.log('\n4. Finishing execution...');
  await execute(
    `UPDATE Execution SET OverallStatus = @status, FinishTime = SYSUTCDATETIME(), ErrorMessage = @errorMessage, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = 'api-key' WHERE Id = @id`,
    [
      { name: 'status', type: TYPES.BigInt, value: STATUS_IDS.SUCCESS },
      { name: 'errorMessage', type: TYPES.NVarChar, value: null },
      { name: 'id', type: TYPES.BigInt, value: executionId },
    ]
  );
  console.log('   OK: Execution finished with SUCCESS');

  // 5. Verify by reading back
  console.log('\n5. Verification...');
  const verify = await query(
    `SELECT e.Id, sc.Code AS Status, e.TriggerSource, e.InvokedBy, 
            (SELECT COUNT(*) FROM ExecutionStep es WHERE es.ExecutionId = e.Id) AS StepCount
     FROM Execution e JOIN StatusCatalog sc ON e.OverallStatus = sc.Id WHERE e.Id = @id`,
    [{ name: 'id', type: TYPES.BigInt, value: executionId }]
  );
  console.log(`   Execution ${verify[0].Id}: status=${verify[0].Status}, steps=${verify[0].StepCount}, trigger=${verify[0].TriggerSource}, invokedBy=${verify[0].InvokedBy}`);

  // 6. Cleanup test data
  console.log('\n6. Cleaning up test data...');
  await execute('DELETE FROM ExecutionStep WHERE ExecutionId = @id', [{ name: 'id', type: TYPES.BigInt, value: executionId }]);
  await execute('DELETE FROM Execution WHERE Id = @id', [{ name: 'id', type: TYPES.BigInt, value: executionId }]);
  console.log('   OK: Test data cleaned up');

  console.log('\n✓ All Write API operations tested successfully!');
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
