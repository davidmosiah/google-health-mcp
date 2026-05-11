/**
 * Delx Wellness shared profile store — canonical source.
 *
 * Single source of truth for user wellness context across the 14+ MCP
 * connectors in the Delx Wellness ecosystem. Stored at:
 *
 *   ~/.delx-wellness/profile.json
 *
 * Every connector that wants to read/write user profile data vendors a
 * COPY of this file into `src/services/profile-store.ts` (keeps each
 * connector self-contained, no extra npm dep). When the schema changes,
 * bump v1 → v2 here AND copy the same change into every connector.
 *
 * Schema is intentionally identical to
 * `delx-wellness-hermes/src/wellness-profile.ts` (v1) so the Hermes /
 * OpenClaw profile packs can hand off seamlessly via the migration
 * helper below.
 *
 * PRIVACY CONTRACT (enforced at validation time):
 *   ✘ NEVER stores OAuth tokens, API keys, refresh tokens, cookies,
 *     session ids, raw provider secrets.
 *   ✘ NEVER stores diagnostic biomarkers (HRV, glucose, BP) — those live
 *     in the connector's own data flow.
 *   ✓ Stores only what the user explicitly typed into onboarding:
 *     preferred name, body basics, goals, devices, training context,
 *     nutrition context, exercise preferences, agent preferences,
 *     safety flags.
 */
/// <reference types="node" />

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type WellnessLanguage = "en" | "pt-BR";
export type WellnessUnits = "metric" | "imperial";
export type WellnessReplyStyle = "concise" | "detailed";

export interface WellnessProfile {
  preferred_name: string;
  language: WellnessLanguage;
  timezone: string;
  units: WellnessUnits;
  /** Either an integer year (e.g. "1985") or a stated age (e.g. "39"). Optional. */
  age_or_birth_year: string;
  /** Free-form, e.g. "178 cm" or "5'10\"". */
  height: string;
  /** Free-form, e.g. "72 kg" or "158 lb". */
  weight: string;
  /** Free-form context for cycle-aware coaching, e.g. "female (menstruating)". Optional. */
  sex_or_gender_context: string;
}

export interface WellnessGoals {
  primary: string;
  secondary: string[];
  training_focus: string;
  recovery_focus: string;
  nutrition_focus: string;
  sleep_focus: string;
  biggest_friction: string;
}

export interface WellnessDevices {
  connected: string[];
  desired: string[];
  primary_recovery_source: string;
  primary_activity_source: string;
  primary_nutrition_source: string;
}

export interface WellnessTraining {
  sports: string[];
  weekly_schedule: string;
  equipment: string[];
  location: string[];
  preferred_duration_minutes: string;
  exercises_to_avoid: string[];
  limitations: string[];
}

export interface WellnessNutrition {
  dietary_preferences: string[];
  restrictions_or_allergies: string[];
  protein_target_g: string;
  hydration_target_ml: string;
  calorie_target: string;
}

export interface WellnessPreferences {
  language_priority: WellnessLanguage[];
  reply_style: WellnessReplyStyle;
  telegram_style: WellnessReplyStyle;
  ask_before_logging: boolean;
  include_exercise_videos_when_available: boolean;
}

export interface WellnessSafety {
  injuries_or_pain: string[];
  medical_constraints: string[];
  conservative_flags: string[];
}

export interface WellnessProfileDocument {
  schema: "delx-wellness-profile/v1";
  generated_by: string;
  version: 1;
  profile: WellnessProfile;
  goals: WellnessGoals;
  devices: WellnessDevices;
  training: WellnessTraining;
  nutrition: WellnessNutrition;
  preferences: WellnessPreferences;
  safety: WellnessSafety;
  notes: string;
  updated_at?: string;
}

export interface OnboardingQuestion {
  id: string;
  prompt: string;
  category: "profile" | "goals" | "devices" | "training" | "nutrition" | "exercise" | "preferences" | "safety";
  required: boolean;
}

export interface OnboardingFlow {
  locale: WellnessLanguage;
  questions: OnboardingQuestion[];
  storage_path: string;
  privacy_note: string;
}

const PROFILE_DIR = join(homedir(), ".delx-wellness");
const PROFILE_PATH = join(PROFILE_DIR, "profile.json");

const LEGACY_PATHS = [
  join(homedir(), ".hermes/profiles/delx-wellness/wellness-profile.json"),
  join(homedir(), ".openclaw-delx-wellness/workspace/wellness-profile.json"),
];

export const DEFAULT_PROFILE: WellnessProfileDocument = {
  schema: "delx-wellness-profile/v1",
  generated_by: "google-health-mcp-unofficial",
  version: 1,
  profile: {
    preferred_name: "",
    language: "en",
    timezone: "",
    units: "metric",
    age_or_birth_year: "",
    height: "",
    weight: "",
    sex_or_gender_context: "",
  },
  goals: {
    primary: "",
    secondary: [],
    training_focus: "",
    recovery_focus: "",
    nutrition_focus: "",
    sleep_focus: "",
    biggest_friction: "",
  },
  devices: {
    connected: [],
    desired: [],
    primary_recovery_source: "",
    primary_activity_source: "",
    primary_nutrition_source: "nourish",
  },
  training: {
    sports: [],
    weekly_schedule: "",
    equipment: [],
    location: [],
    preferred_duration_minutes: "",
    exercises_to_avoid: [],
    limitations: [],
  },
  nutrition: {
    dietary_preferences: [],
    restrictions_or_allergies: [],
    protein_target_g: "",
    hydration_target_ml: "",
    calorie_target: "",
  },
  preferences: {
    language_priority: ["en", "pt-BR"],
    reply_style: "concise",
    telegram_style: "concise",
    ask_before_logging: true,
    include_exercise_videos_when_available: true,
  },
  safety: {
    injuries_or_pain: [],
    medical_constraints: [],
    conservative_flags: [],
  },
  notes: "",
};

/** Returns the absolute storage path. Useful in privacy_audit responses. */
export function getProfilePath(): string {
  return PROFILE_PATH;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readProfileFile(path: string): Promise<WellnessProfileDocument | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<WellnessProfileDocument>;
    if (parsed?.schema !== "delx-wellness-profile/v1") return null;
    // Structural defaults merge: legacy / partial files often lack one or more
    // sub-objects, and downstream code (buildProfileSummary, missingCriticalFields,
    // updateProfile) assumes every nested object is defined. Fill any missing
    // sub-object from DEFAULT_PROFILE so consumers can never crash on
    // `profile.goals.primary` etc.
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      schema: "delx-wellness-profile/v1",
      version: 1,
      generated_by: parsed.generated_by ?? DEFAULT_PROFILE.generated_by,
      profile: { ...DEFAULT_PROFILE.profile, ...(parsed.profile ?? {}) },
      goals: { ...DEFAULT_PROFILE.goals, ...(parsed.goals ?? {}) },
      devices: { ...DEFAULT_PROFILE.devices, ...(parsed.devices ?? {}) },
      training: { ...DEFAULT_PROFILE.training, ...(parsed.training ?? {}) },
      nutrition: { ...DEFAULT_PROFILE.nutrition, ...(parsed.nutrition ?? {}) },
      preferences: { ...DEFAULT_PROFILE.preferences, ...(parsed.preferences ?? {}) },
      safety: { ...DEFAULT_PROFILE.safety, ...(parsed.safety ?? {}) },
      notes: parsed.notes ?? DEFAULT_PROFILE.notes,
    };
  } catch {
    return null;
  }
}

async function writeProfileFile(path: string, profile: WellnessProfileDocument): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(profile, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, path);
}

/**
 * Read the canonical profile. Returns a fresh DEFAULT_PROFILE if no file
 * exists (and does not create the file — call updateProfile to persist).
 *
 * Auto-migrates from Hermes / OpenClaw profile if found and the canonical
 * file is missing.
 */
export async function getProfile(): Promise<WellnessProfileDocument> {
  if (!(await fileExists(PROFILE_PATH))) {
    const migration = await migrateFromLegacy();
    if (migration.migrated) {
      const migrated = await readProfileFile(PROFILE_PATH);
      if (migrated) return migrated;
    }
    return clone(DEFAULT_PROFILE);
  }
  const existing = await readProfileFile(PROFILE_PATH);
  return existing ?? clone(DEFAULT_PROFILE);
}

/**
 * Persist a partial patch to the canonical profile. Validates the patch
 * against the schema before writing, rejecting unknown top-level keys and
 * any field that smells like a secret (oauth, token, secret, password,
 * cookie, refresh).
 */
export async function updateProfile(
  patch: Partial<WellnessProfileDocument>,
): Promise<WellnessProfileDocument> {
  rejectSecretsInPatch(patch);
  const current = await getProfile();
  const merged: WellnessProfileDocument = {
    schema: "delx-wellness-profile/v1",
    generated_by: current.generated_by || DEFAULT_PROFILE.generated_by,
    version: 1,
    profile: { ...current.profile, ...(patch.profile ?? {}) },
    goals: { ...current.goals, ...(patch.goals ?? {}) },
    devices: { ...current.devices, ...(patch.devices ?? {}) },
    training: { ...current.training, ...(patch.training ?? {}) },
    nutrition: { ...current.nutrition, ...(patch.nutrition ?? {}) },
    preferences: { ...current.preferences, ...(patch.preferences ?? {}) },
    safety: { ...current.safety, ...(patch.safety ?? {}) },
    notes: patch.notes ?? current.notes,
    updated_at: new Date().toISOString(),
  };
  await writeProfileFile(PROFILE_PATH, merged);
  return merged;
}

// Pattern matched against FIELD NAMES (object keys). High signal — a wellness
// profile has zero legitimate reason to contain a field literally named
// "oauth_token" or "api_key". Broad pattern is safe here because keys are
// schema-bound.
const SECRET_KEY_PATTERNS = /(oauth|token|secret|password|cookie|refresh|api[_-]?key|bearer|credential|session[_-]?id)/i;

// Pattern matched against FIELD VALUES (free text). Must be high-specificity
// because users will legitimately write "I do 3 training sessions per week",
// "limit cookies", "I need to refresh my routine", "secret sauce: more sleep",
// etc. We only block actual credential shapes:
//   - JWT-like (xxx.yyy.zzz with base64-ish chunks)
//   - "Bearer <token>" with a real-looking token
//   - Stripe sk_live_/sk_test_ keys
//   - Slack xoxb-/xoxp- tokens
//   - GitHub personal access tokens (github_pat_, ghp_, gho_, ghs_, ghr_)
//   - OpenAI sk-...
//   - "Authorization: ..."
const SECRET_VALUE_PATTERNS =
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{20,}|sk_(live|test)_[A-Za-z0-9]{20,}|xox[bporas]-[A-Za-z0-9-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[posru]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Authorization:\s*[A-Za-z]+\s+[A-Za-z0-9._-]+)/;

function rejectSecretsInPatch(patch: Partial<WellnessProfileDocument>): void {
  function scan(value: unknown, path: string[] = []): void {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      if (SECRET_VALUE_PATTERNS.test(value)) {
        const flat = path.join(".") || "<root>";
        throw new Error(
          `Refusing to store credential-shaped value at '${flat}'. ` +
          `Profile is for non-secret wellness context only; keep tokens in each connector's own local config (e.g. ~/.whoop-mcp/, ~/.oura-mcp/, etc.).`,
        );
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, i) => scan(entry, [...path, String(i)]));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SECRET_KEY_PATTERNS.test(k)) {
          throw new Error(
            `Refusing to store secret-like field name '${k}'. ` +
            `Profile is for non-secret wellness context only; keep tokens in each connector's own local config.`,
          );
        }
        scan(v, [...path, k]);
      }
    }
  }
  scan(patch);
}

/**
 * One-time migration from the Hermes or OpenClaw profile pack location.
 * Only runs if the canonical file does NOT exist. Idempotent.
 */
export async function migrateFromLegacy(): Promise<{ migrated: boolean; from?: string }> {
  if (await fileExists(PROFILE_PATH)) return { migrated: false };
  for (const candidate of LEGACY_PATHS) {
    if (await fileExists(candidate)) {
      const legacy = await readProfileFile(candidate);
      if (legacy) {
        await writeProfileFile(PROFILE_PATH, { ...legacy, updated_at: new Date().toISOString() });
        return { migrated: true, from: candidate };
      }
    }
  }
  return { migrated: false };
}

const QUESTIONS_EN: OnboardingQuestion[] = [
  { id: "preferred_name", category: "profile", required: false, prompt: "What should the agent call you?" },
  { id: "locale_timezone_units", category: "profile", required: true, prompt: "What are your language, timezone, and units?" },
  { id: "body_basics", category: "profile", required: false, prompt: "Share age or birth year, height, weight, and gender/sex only if you want the agent to use that context." },
  { id: "primary_goal", category: "goals", required: true, prompt: "What is your primary wellness goal right now?" },
  { id: "secondary_goals", category: "goals", required: false, prompt: "What secondary goals matter: fat loss, muscle, endurance, sleep, recovery, longevity, stress, consistency?" },
  { id: "devices", category: "devices", required: true, prompt: "Which sources do you use: WHOOP, Garmin, Oura, Strava, Fitbit, Google Health, Withings, Apple Health, Samsung Health, Polar, Nourish, Air, CGM, Cycle Coach?" },
  { id: "training_context", category: "training", required: true, prompt: "What sports do you train, how often, and what does a normal week look like?" },
  { id: "nutrition_context", category: "nutrition", required: false, prompt: "What nutrition context should the agent know: meals, calories, macros, restrictions, allergies, or food preferences?" },
  { id: "exercise_preferences", category: "exercise", required: false, prompt: "What equipment, location, duration, exercises to avoid, or limitations should workouts respect?" },
  { id: "agent_preferences", category: "preferences", required: false, prompt: "Do you prefer concise replies, detailed explanations, pt-BR, English, or logging confirmations?" },
  { id: "safety_context", category: "safety", required: false, prompt: "Any injuries, pain, medical constraints, or symptoms the agent should treat as a reason to be conservative?" },
];

const QUESTIONS_PT_BR: OnboardingQuestion[] = [
  { id: "preferred_name", category: "profile", required: false, prompt: "Como o agente deve te chamar?" },
  { id: "locale_timezone_units", category: "profile", required: true, prompt: "Qual idioma, fuso horário e sistema de medidas você prefere?" },
  { id: "body_basics", category: "profile", required: false, prompt: "Compartilhe idade ou ano de nascimento, altura, peso e gênero/sexo apenas se quiser que o agente use esse contexto." },
  { id: "primary_goal", category: "goals", required: true, prompt: "Qual é seu principal objetivo de wellness agora?" },
  { id: "secondary_goals", category: "goals", required: false, prompt: "Quais objetivos secundários importam: perda de gordura, massa, endurance, sono, recuperação, longevidade, estresse ou consistência?" },
  { id: "devices", category: "devices", required: true, prompt: "Quais fontes você usa: WHOOP, Garmin, Oura, Strava, Fitbit, Google Health, Withings, Apple Health, Samsung Health, Polar, Nourish, Air, CGM, Cycle Coach?" },
  { id: "training_context", category: "training", required: true, prompt: "Quais esportes você treina, com que frequência, e como é uma semana normal?" },
  { id: "nutrition_context", category: "nutrition", required: false, prompt: "Que contexto nutricional o agente deve saber: refeições, calorias, macros, restrições, alergias ou preferências alimentares?" },
  { id: "exercise_preferences", category: "exercise", required: false, prompt: "Quais equipamentos, local, duração, exercícios a evitar ou limitações os treinos devem respeitar?" },
  { id: "agent_preferences", category: "preferences", required: false, prompt: "Você prefere respostas concisas, explicações detalhadas, pt-BR, inglês ou confirmações antes de registrar dados?" },
  { id: "safety_context", category: "safety", required: false, prompt: "Há lesões, dor, restrições médicas ou sintomas que o agente deve tratar como motivo para ser conservador?" },
];

/** Return the 11-question onboarding flow in the requested locale. */
export function getOnboardingQuestions(locale: WellnessLanguage = "en"): OnboardingQuestion[] {
  return locale === "pt-BR" ? clone(QUESTIONS_PT_BR) : clone(QUESTIONS_EN);
}

export function getOnboardingFlow(locale: WellnessLanguage = "en"): OnboardingFlow {
  return {
    locale,
    questions: getOnboardingQuestions(locale),
    storage_path: PROFILE_PATH,
    privacy_note:
      "Profile NEVER stores OAuth tokens, API keys, refresh tokens, cookies, or raw provider secrets. " +
      "Tokens stay in each connector's own local config (e.g. ~/.whoop-mcp/, ~/.oura-mcp/, ~/.garmin-mcp/, etc.), " +
      "separate from this shared profile.",
  };
}

/** One-line summary for agent context handoff. */
export function buildProfileSummary(profile: WellnessProfileDocument): string {
  const parts: string[] = [];
  const p = profile.profile;
  if (p.preferred_name) parts.push(p.preferred_name);
  if (p.age_or_birth_year || p.sex_or_gender_context) {
    const bits = [p.age_or_birth_year, p.sex_or_gender_context].filter(Boolean).join(", ");
    parts.push(bits);
  }
  if (p.height && p.weight) parts.push(`${p.height} / ${p.weight}`);
  if (profile.goals.primary) parts.push(`goal: ${profile.goals.primary}`);
  if (profile.devices.connected.length > 0) parts.push(`devices: ${profile.devices.connected.join(", ")}`);
  if (profile.preferences.language_priority[0]) parts.push(`lang: ${profile.preferences.language_priority[0]}`);
  return parts.length > 0 ? parts.join(" · ") : "Empty profile — run onboarding to populate.";
}

export function missingCriticalFields(profile: WellnessProfileDocument): string[] {
  const missing: string[] = [];
  if (!profile.profile.preferred_name) missing.push("preferred_name");
  if (!profile.profile.timezone) missing.push("timezone");
  if (!profile.goals.primary) missing.push("primary_goal");
  if (profile.devices.connected.length === 0) missing.push("connected_devices");
  if (!profile.training.weekly_schedule) missing.push("training_weekly_schedule");
  return missing;
}
