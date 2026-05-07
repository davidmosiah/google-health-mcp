const SENSITIVE_KEY_PATTERN = /^(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization|password|api[_-]?key)$/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(access_token["'=:\s]+)[A-Za-z0-9._~+/=-]+/gi,
  /(refresh_token["'=:\s]+)[A-Za-z0-9._~+/=-]+/gi,
  /(client_secret["'=:\s]+)[A-Za-z0-9._~+/=-]+/gi
];

export const REDACTED_KEY_PATTERNS = [
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "authorization",
  "password",
  "api_key",
  "bearer values in text"
];

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (!value || typeof value !== "object") return typeof value === "string" ? redactSecretStrings(value) : value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSensitive(nestedValue)
    ])
  );
}

export function redactErrorMessage(message: string): string {
  return redactSecretStrings(message);
}

function redactSecretStrings(message: string): string {
  return SECRET_VALUE_PATTERNS.reduce((current, pattern) => current.replace(pattern, (_match, prefix: string) => {
    return prefix ? `${prefix}[REDACTED]` : "[REDACTED]";
  }), message);
}
