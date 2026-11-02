import assert from 'node:assert/strict';
import { assertScorecardReport } from './check-scorecard-report.mjs';
const ids = ['schema_validity', 'tool_naming', 'dense_series_caps', 'privacy_modes', 'mutation_gating', 'agent_manifest', 'smoke_test', 'resources', 'tool_descriptions', 'annotations', 'manifest_discoverability'];
const valid = {totalScore:100, checks:ids.map(id => ({id,status:'pass',score:10,details:[]}))};
assert.doesNotThrow(() => assertScorecardReport(valid));
const withCheck = (index, patch) => ({...valid,checks:valid.checks.map((c,i) => i === index ? {...c,...patch} : c)});
const invalid = [null, {}, {totalScore:100, checks:[]}, {...valid,totalScore:89}, {...valid,totalScore:NaN},
  withCheck(0,{status:'warn'}), withCheck(2,{status:'fail'}), withCheck(0,{status:'skip'}),
  {...valid,checks:[valid.checks[0]]}, {...valid,checks:[...valid.checks,valid.checks[0]]},
  withCheck(1,{id:'schema_validity'}), withCheck(1,{id:'unknown_check'}),
  withCheck(0,{score:9}), withCheck(0,{details:['Invalid schema']}), withCheck(0,{details:null}),
  {...valid,checks:[null,...valid.checks.slice(1)]}];
for (const value of invalid) assert.throws(() => assertScorecardReport(value));
console.log(`PASS ${1+invalid.length} scorecard gate fixtures, including aggregate100 with failed/missing/duplicate checks`);
