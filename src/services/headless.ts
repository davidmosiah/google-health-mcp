export interface HeadlessDetection {
  headless: boolean;
  reason: string;
}

/**
 * Headless hosts have no browser to hand the auth URL to, and their loopback
 * interface is not the one the operator's browser will be redirected to. Both
 * make the local-callback OAuth flow fail, so auth falls back to pasting the
 * redirect URL back into the terminal.
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
