import {
  GOOGLE_HEALTH_DATA_SOURCE_FAMILIES,
  GOOGLE_HEALTH_DATA_TYPES,
  GOOGLE_HEALTH_DATA_TYPES_SOURCE,
  type GoogleHealthDataTypeSupport
} from "../constants.js";
import { redactErrorMessage } from "./redaction.js";
import type { GoogleHealthClient } from "./google-health-client.js";

type UnknownRecord = Record<string, unknown>;
type CoverageMode = "plan" | "live";
type CoverageResult = "ok" | "error" | "skipped";

export interface CoverageReportOptions {
  live?: boolean;
  date?: string;
  dataSourceFamily?: string;
  dataTypes?: string[];
}

export interface CoverageOperationReport {
  operation: GoogleHealthDataTypeSupport;
  result: CoverageResult;
  has_data?: boolean;
  point_count_bucket?: "none" | "single" | "multiple" | "unknown";
  error_code?: string;
  error_summary?: string;
}

export interface DataTypeCoverageRow {
  slug: string;
  name: string;
  kind: string;
  scope: string;
  unit: string;
  supports: GoogleHealthDataTypeSupport[];
  official_operations: string[];
  operations: CoverageOperationReport[];
}

export interface DataTypeCoverageReport extends Record<string, unknown> {
  kind: "data_type_coverage";
  mode: CoverageMode;
  generated_at: string;
  source: typeof GOOGLE_HEALTH_DATA_TYPES_SOURCE;
  date: string;
  data_source_family: string;
  privacy_contract: {
    raw_payloads_included: false;
    health_measurements_included: false;
    oauth_secrets_included: false;
    local_paths_included: false;
  };
  totals: {
    data_types: number;
    operations: number;
    ok: number;
    error: number;
    skipped: number;
  };
  data_types: DataTypeCoverageRow[];
  next_steps: string[];
}

type CoverageClient = Pick<GoogleHealthClient, "listDataPoints" | "reconcileDataPoints" | "dailyRollup">;

const DEFAULT_SOURCE_FAMILY = "users/me/dataSourceFamilies/all-sources";

export function buildDataTypeCoveragePlan(options: CoverageReportOptions = {}): DataTypeCoverageReport {
  return buildBaseReport("plan", options, (entry) => entry.supports.map((operation) => ({
    operation,
    result: "skipped",
    error_summary: "Run with --live after OAuth setup to validate this operation against a real account."
  })));
}

export async function buildLiveDataTypeCoverage(client: CoverageClient, options: CoverageReportOptions = {}): Promise<DataTypeCoverageReport> {
  const rows: DataTypeCoverageRow[] = [];
  for (const entry of selectedDataTypes(options.dataTypes)) {
    const operations: CoverageOperationReport[] = [];
    for (const operation of entry.supports) {
      operations.push(await runOperation(client, entry.slug, operation, options));
    }
    rows.push(rowFor(entry, operations));
  }
  return finalizeReport("live", options, rows);
}

export function formatCoverageMarkdown(report: DataTypeCoverageReport): string {
  const rows = report.data_types.map((entry) => {
    const ops = entry.operations.map((op) => {
      const detail = op.result === "ok"
        ? `${op.operation}: ${op.has_data ? "data-present" : "no-data"}`
        : `${op.operation}: ${op.result}${op.error_code ? ` (${op.error_code})` : ""}`;
      return detail;
    }).join("; ");
    return `- \`${entry.slug}\` — ${entry.name}; scope: ${entry.scope}; ${ops}`;
  });
  return [
    "# Google Health Data Type Coverage",
    "",
    "- **mode**: " + report.mode,
    "- **date**: " + report.date,
    "- **source_family**: " + report.data_source_family,
    "- **official_snapshot**: " + report.source.url + " (last updated " + report.source.page_last_updated + ")",
    "- **data_types**: " + report.totals.data_types,
    "- **operations**: " + report.totals.operations,
    "- **ok/error/skipped**: " + `${report.totals.ok}/${report.totals.error}/${report.totals.skipped}`,
    "",
    "## Results",
    ...rows,
    "",
    "## Privacy",
    "- Raw payloads included: no",
    "- Health measurements included: no",
    "- OAuth secrets included: no",
    "- Local paths included: no",
    "",
    "## Next steps",
    ...report.next_steps.map((step) => `- ${step}`)
  ].join("\n");
}

async function runOperation(client: CoverageClient, dataType: string, operation: GoogleHealthDataTypeSupport, options: CoverageReportOptions): Promise<CoverageOperationReport> {
  try {
    const payload = await callOperation(client, dataType, operation, options);
    const count = countPoints(payload);
    return {
      operation,
      result: "ok",
      has_data: count > 0,
      point_count_bucket: bucketCount(count)
    };
  } catch (error) {
    return {
      operation,
      result: "error",
      error_code: errorCode(error),
      error_summary: summarizeError(error)
    };
  }
}

function callOperation(client: CoverageClient, dataType: string, operation: GoogleHealthDataTypeSupport, options: CoverageReportOptions): Promise<unknown> {
  const date = normalizeDate(options.date);
  const dataSourceFamily = normalizeSourceFamily(options.dataSourceFamily);
  if (operation === "list") {
    return client.listDataPoints({ dataType, pageSize: 1 });
  }
  if (operation === "reconcile") {
    return client.reconcileDataPoints({ dataType, pageSize: 1, dataSourceFamily });
  }
  return client.dailyRollup({
    dataType,
    startDate: date,
    endDate: nextDate(date),
    pageSize: 1,
    dataSourceFamily
  });
}

function buildBaseReport(
  mode: CoverageMode,
  options: CoverageReportOptions,
  operationsFor: (entry: typeof GOOGLE_HEALTH_DATA_TYPES[number]) => CoverageOperationReport[]
): DataTypeCoverageReport {
  const rows = selectedDataTypes(options.dataTypes).map((entry) => rowFor(entry, operationsFor(entry)));
  return finalizeReport(mode, options, rows);
}

function finalizeReport(mode: CoverageMode, options: CoverageReportOptions, dataTypes: DataTypeCoverageRow[]): DataTypeCoverageReport {
  const operations = dataTypes.flatMap((entry) => entry.operations);
  return {
    kind: "data_type_coverage",
    mode,
    generated_at: new Date().toISOString(),
    source: GOOGLE_HEALTH_DATA_TYPES_SOURCE,
    date: normalizeDate(options.date),
    data_source_family: normalizeSourceFamily(options.dataSourceFamily),
    privacy_contract: {
      raw_payloads_included: false,
      health_measurements_included: false,
      oauth_secrets_included: false,
      local_paths_included: false
    },
    totals: {
      data_types: dataTypes.length,
      operations: operations.length,
      ok: operations.filter((operation) => operation.result === "ok").length,
      error: operations.filter((operation) => operation.result === "error").length,
      skipped: operations.filter((operation) => operation.result === "skipped").length
    },
    data_types: dataTypes,
    next_steps: nextSteps(mode)
  };
}

function rowFor(entry: typeof GOOGLE_HEALTH_DATA_TYPES[number], operations: CoverageOperationReport[]): DataTypeCoverageRow {
  return {
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    scope: entry.scope,
    unit: entry.unit,
    supports: [...entry.supports],
    official_operations: [...entry.official_operations],
    operations
  };
}

function selectedDataTypes(slugs: string[] | undefined): typeof GOOGLE_HEALTH_DATA_TYPES[number][] {
  if (!slugs?.length) return [...GOOGLE_HEALTH_DATA_TYPES];
  const wanted = new Set(slugs.map((slug) => slug.trim()).filter(Boolean));
  return GOOGLE_HEALTH_DATA_TYPES.filter((entry) => wanted.has(entry.slug));
}

function countPoints(payload: unknown): number {
  if (!isObject(payload)) return 0;
  for (const key of ["dataPoints", "rollupDataPoints", "records", "buckets"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.length;
  }
  return 0;
}

function bucketCount(count: number): "none" | "single" | "multiple" | "unknown" {
  if (!Number.isFinite(count)) return "unknown";
  if (count <= 0) return "none";
  if (count === 1) return "single";
  return "multiple";
}

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function nextDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

function normalizeSourceFamily(value: string | undefined): string {
  if (!value) return DEFAULT_SOURCE_FAMILY;
  if ((GOOGLE_HEALTH_DATA_SOURCE_FAMILIES as readonly string[]).includes(value)) return value;
  const expanded = `users/me/dataSourceFamilies/${value}`;
  if ((GOOGLE_HEALTH_DATA_SOURCE_FAMILIES as readonly string[]).includes(expanded)) return expanded;
  return DEFAULT_SOURCE_FAMILY;
}

function errorCode(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match ? `HTTP_${match[1]}` : undefined;
}

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactLocalPaths(redactErrorMessage(message)).slice(0, 240);
}

function redactLocalPaths(value: string): string {
  return value
    .replace(/\/Users\/[^\s"']+/g, "[local-path]")
    .replace(/\/home\/[^\s"']+/g, "[local-path]")
    .replace(/[A-Z]:\\[^\s"']+/g, "[local-path]");
}

function nextSteps(mode: CoverageMode): string[] {
  if (mode === "plan") {
    return [
      "Run `google-health-mcp-server coverage --live --json` after OAuth setup to validate against a real account.",
      "Paste the redacted JSON into issue #3 only after reviewing it for personal details.",
      "If an operation returns an error, compare the data type and operation against the official Google Health data types page."
    ];
  }
  return [
    "Review this redacted report before publishing.",
    "Comment on issue #3 with data type, source family and operation status.",
    "Do not include raw Google Health responses or personal health measurements."
  ];
}
