import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('payout and re-enrollment storage flow preserves history and prevents double funding',()=>{
  const result=spawnSync(process.execPath,['--experimental-test-module-mocks',new URL('./funding-integration-runner.mjs',import.meta.url).pathname],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
