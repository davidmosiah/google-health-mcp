import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_CHECKS = [
  'schema_validity', 'tool_naming', 'dense_series_caps', 'privacy_modes',
  'mutation_gating', 'agent_manifest', 'smoke_test', 'resources',
  'tool_descriptions', 'annotations', 'manifest_discoverability'
];

export function assertScorecardReport(report) {
  if (!report || !Number.isFinite(report.totalScore) || report.totalScore < 90 ||
      !Array.isArray(report.checks) || report.checks.length === 0) {
    throw new Error('Missing or below-threshold scorecard report');
  }
  const ids = report.checks.map(check => check?.id);
  if (new Set(ids).size !== REQUIRED_CHECKS.length || ids.length !== REQUIRED_CHECKS.length ||
      REQUIRED_CHECKS.some(id => !ids.includes(id))) {
    throw new Error('Missing, duplicated, or unknown scorecard checks');
  }
  for (const check of report.checks) {
    if (!check || typeof check.id !== 'string' || !['pass', 'warn'].includes(check.status)) {
      throw new Error(`Failed or invalid scorecard subcheck: ${check?.id ?? 'unknown'}`);
    }
  }
  const schema = report.checks.find(check => check.id === 'schema_validity');
  if (schema.status !== 'pass' || schema.score !== 10 || !Array.isArray(schema.details) || schema.details.length !== 0) {
    throw new Error('Schema validity must pass');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.argv[2]) throw new Error('Scorecard report path is required');
  assertScorecardReport(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log('Scorecard threshold and all subchecks accepted; schema validity passed');
}
