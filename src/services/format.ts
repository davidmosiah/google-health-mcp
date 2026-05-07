import type { ResponseFormat, ToolResponse } from "../types.js";
import { redactErrorMessage, redactSensitive } from "./redaction.js";

export function makeResponse<T>(data: T, format: ResponseFormat, markdown: string): ToolResponse<T> {
  const safeData = redactSensitive(data) as T;
  const safeMarkdown = redactErrorMessage(markdown);
  return {
    content: [{ type: "text", text: format === "json" ? JSON.stringify(safeData, null, 2) : safeMarkdown }],
    structuredContent: safeData
  };
}

export function makeError(message: string): ToolResponse<{ error: string }> {
  const safeMessage = redactErrorMessage(message);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${safeMessage}` }],
    structuredContent: { error: safeMessage }
  };
}

export function bulletList(title: string, fields: Record<string, unknown>): string {
  const lines = [`# ${title}`, ""];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    lines.push(`- **${key}**: ${formatMarkdownValue(value)}`);
  }
  return lines.join("\n");
}

export function formatCollection(title: string, records: unknown[], meta: Record<string, unknown>): string {
  const metaLines = Object.entries(meta)
    .filter(([key, value]) => key !== "records" && value !== undefined && value !== null)
    .map(([key, value]) => `- **${key}**: ${formatMarkdownValue(value)}`);
  const lines = [`# ${title}`, "", ...metaLines, ""];
  const preview = records.slice(0, 8);
  for (const [index, record] of preview.entries()) {
    if (record && typeof record === "object") {
      const object = record as Record<string, unknown>;
      const id = object.id ?? object.id_str ?? `item-${index + 1}`;
      const start = object.start_date ?? object.start_date_local ?? object.created_at ?? object.updated_at ?? "n/a";
      const sport = object.sport_type ?? object.type ?? "n/a";
      lines.push(`## ${String(id)}`);
      if (object.name) lines.push(`- **name**: ${String(object.name)}`);
      lines.push(`- **start/created**: ${String(start)}`);
      lines.push(`- **sport/type**: ${String(sport)}`);
      if (object.distance !== undefined) lines.push(`- **distance_m**: ${String(object.distance)}`);
      if (object.moving_time !== undefined) lines.push(`- **moving_time_s**: ${String(object.moving_time)}`);
      if (object.total_elevation_gain !== undefined) lines.push(`- **elevation_m**: ${String(object.total_elevation_gain)}`);
      lines.push("");
    } else {
      lines.push(`- ${JSON.stringify(record)}`);
    }
  }
  if (records.length > preview.length) lines.push(`... ${records.length - preview.length} more records omitted from markdown preview.`);
  return lines.join("\n");
}

function formatMarkdownValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => String(item)).join(", ");
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
