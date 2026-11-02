/** HTTP is unauthenticated and must stay on literal loopback interfaces. */
export function localHttpHost(value: string | undefined): "127.0.0.1" | "::1" {
  if (value === undefined || value === "127.0.0.1") return "127.0.0.1";
  if (value === "::1") return "::1";
  // Normalize this one name without DNS or trusting /etc/hosts.
  if (typeof value === "string" && value.toLowerCase() === "localhost") return "127.0.0.1";
  throw new Error("Unauthenticated HTTP transport requires loopback. Use 127.0.0.1, ::1 or localhost, or use stdio; remote deployment requires an authenticated access plan.");
}

/** URL syntax requires brackets around the literal IPv6 loopback address. */
export function formatLocalHttpOrigin(host: "127.0.0.1" | "::1" | "localhost", port: number): string {
  return `http://${host === "::1" ? "[::1]" : host}:${port}`;
}
