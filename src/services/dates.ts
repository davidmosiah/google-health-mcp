/** Where "today" is: the caller's IANA timezone (UTC when omitted) and an injectable clock (epoch ms) for tests. */
export interface TodayContext {
  timezone?: string;
  now?: number;
}

export function invalidTimezoneMessage(timeZone: string): string {
  return `Invalid timezone "${timeZone}": use an IANA name such as America/New_York or UTC.`;
}

export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Civil YYYY-MM-DD date of `now` in an IANA timezone (Google Health uses civil dates). */
export function todayIn(timeZone = "UTC", now: number = Date.now()): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    throw new Error(invalidTimezoneMessage(timeZone));
  }
  // formatToParts, not format(): locale data decides format()'s shape, and it has changed before.
  const part = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

/** A YYYY-MM-DD date, with missing or "today" resolved on the clock. The timezone is validated either way. */
export function resolveDate(value: string | undefined, clock: TodayContext = {}): string {
  const today = todayIn(clock.timezone, clock.now);
  return value === undefined || value === "today" ? today : value;
}
