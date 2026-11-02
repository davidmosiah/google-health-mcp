import { constants, promises as fs } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** Disk/serialized-document quota; not a total process-memory guarantee. */
export const MAX_PROFILE_BYTES = 256 * 1024;
const LOCK_WAIT_MS = 5_000;

export async function readProfileText(path: string): Promise<string> {
  // Nonblocking/no-follow where supported: a profile must be a regular file.
  const handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_PROFILE_BYTES) throw new Error("Invalid or oversized profile file.");
    const bytes = Buffer.alloc(MAX_PROFILE_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
      size += bytesRead;
      if (size > MAX_PROFILE_BYTES) throw new Error("Profile exceeds the 256 KiB storage limit.");
    }
    throw new Error("Profile exceeds the 256 KiB storage limit.");
  } finally { await handle.close(); }
}

/** Cooperative cross-process lock. Never steal a lock based on age or PID. */
export async function withProfileLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 }).catch(() => { throw new Error("Wellness profile storage is unavailable. Check local file access before retrying."); });
  const lock = `${path}.lock`;
  const deadline = performance.now() + LOCK_WAIT_MS;
  for (;;) {
    try { await fs.mkdir(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("Wellness profile lock is unavailable. Check local file access before retrying.");
      if (performance.now() >= deadline) throw new Error("Wellness profile is busy or its lock needs recovery. Stop all profile writers before removing an abandoned profile.json.lock directory, then retry.");
      await delay(25);
    }
  }
  try { return await work(); }
  finally { await fs.rmdir(lock).catch(() => { throw new Error("Wellness profile lock could not be released. Stop all profile writers before checking local file access."); }); }
}

/** Caller holds the canonical lock; exclusive temp avoids same-process collisions. */
export async function writeProfileText(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(text, "utf8") > MAX_PROFILE_BYTES) throw new Error("Wellness profile exceeds the 256 KiB storage limit; shorten profile text before retrying.");
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 }).catch(() => { throw new Error("Wellness profile storage is unavailable. Check local file access before retrying."); });
  const temporary = `${path}.tmp.${randomUUID()}`;
  let created = false;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    created = true;
    try { await handle.writeFile(text, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, path);
  } catch {
    throw new Error("Wellness profile could not be saved. Check local file access before retrying.");
  } finally {
    if (created) await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw new Error("Wellness profile temporary file could not be removed. Check local file access before retrying."); });
  }
}
