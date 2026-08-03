/** Result of headless detection, including the signal that decided it. */
export interface HeadlessDetection {
  /** True when no usable local browser is expected on this host. */
  headless: boolean;
  /** Human-readable signal behind the verdict; surfaced by `doctor`. */
  reason: string;
}

/**
 * Headless hosts have no browser to hand the auth URL to, and their loopback
 * interface is not the one the operator's browser will be redirected to. Both
 * make the local-callback OAuth flow fail, so auth falls back to pasting the
 * redirect URL back into the terminal.
 *
 * Signals are checked in precedence order:
 *
 * 1. `GOOGLE_HEALTH_HEADLESS` — explicit opt in/out, wins over everything.
 * 2. `SSH_CONNECTION`/`SSH_TTY`/`SSH_CLIENT` — a local display, if any,
 *    belongs to the remote host rather than the operator.
 * 3. Platform — macOS and Windows always have a usable browser.
 * 4. `DISPLAY`/`WAYLAND_DISPLAY` — absent on Linux servers and containers.
 *
 * @param env defaults to `process.env`; injectable for tests and `doctor`.
 * @param platform defaults to `process.platform`; injectable for tests.
 */
export function detectHeadlessEnvironment(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform
): HeadlessDetection {
  const override = env.GOOGLE_HEALTH_HEADLESS?.trim().toLowerCase();
  if (override && ["1", "true", "yes", "on"].includes(override)) {
    return { headless: true, reason: "GOOGLE_HEALTH_HEADLESS is set" };
  }
  if (override && ["0", "false", "no", "off"].includes(override)) {
    return { headless: false, reason: "GOOGLE_HEALTH_HEADLESS opts out of headless detection" };
  }
  if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) {
    return { headless: true, reason: "running over SSH" };
  }
  if (platform === "win32" || platform === "darwin") {
    return { headless: false, reason: "desktop platform" };
  }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return { headless: true, reason: "no DISPLAY or WAYLAND_DISPLAY" };
  }
  return { headless: false, reason: "local display available" };
}
