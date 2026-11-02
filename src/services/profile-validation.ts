/** Check partial sections against the v1 contract before any IO or merge. */
export function validateProfileShape(value: unknown, defaults: Record<string, unknown>, stored = false): void {
  const sections = ["profile", "goals", "devices", "training", "nutrition", "preferences", "safety", "notes"];
  const metadata = ["schema", "generated_by", "version", "updated_at"];
  function object(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === "object" && !Array.isArray(input)
      && (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null);
  }
  function fail(): never { throw new Error("Invalid wellness profile patch: use known v1 fields and their declared types."); }
  const enums: Record<string, readonly string[]> = {
    "profile.language": ["en", "pt-BR"],
    "profile.units": ["metric", "imperial"],
    "preferences.reply_style": ["concise", "detailed"],
    "preferences.telegram_style": ["concise", "detailed"],
    "preferences.language_priority": ["en", "pt-BR"],
  };
  function check(input: unknown, expected: unknown, path: string): void {
    const allowed = enums[path];
    if (Array.isArray(expected)) {
      if (!Array.isArray(input) || !input.every(item => typeof item === "string")) fail();
      if (allowed && !(input as string[]).every(item => allowed.includes(item))) fail();
    } else if (object(expected)) {
      if (!object(input)) fail();
      for (const [key, item] of Object.entries(input)) {
        if (!Object.prototype.hasOwnProperty.call(expected, key)) fail();
        check(item, expected[key], `${path}.${key}`);
      }
    } else {
      if (typeof input !== typeof expected) fail();
      if (allowed && !allowed.includes(input as string)) fail();
    }
  }
  if (!object(value)) fail();
  for (const [key, item] of Object.entries(value)) {
    if (sections.includes(key)) {
      check(item, defaults[key], key);
    } else if (stored && metadata.includes(key)) {
      if (key === "version" ? item !== 1 : typeof item !== "string") fail();
    } else fail();
  }
}
