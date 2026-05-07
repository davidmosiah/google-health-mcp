import { constants, promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { GoogleHealthTokenSet } from "../types.js";

const LOCK_RETRY_MS = 250;
const LOCK_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TokenStore {
  constructor(private readonly tokenPath: string) {}

  private get lockPath(): string {
    return `${this.tokenPath}.lock`;
  }

  async read(): Promise<GoogleHealthTokenSet | null> {
    try {
      const text = await fs.readFile(this.tokenPath, "utf8");
      return JSON.parse(text) as GoogleHealthTokenSet;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(tokens: GoogleHealthTokenSet): Promise<void> {
    await fs.mkdir(dirname(this.tokenPath), { recursive: true, mode: 0o700 });
    const tmp = `${this.tokenPath}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.tokenPath);
    await fs.chmod(this.tokenPath, 0o600).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await fs.unlink(this.tokenPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(dirname(this.lockPath), { recursive: true, mode: 0o700 });
    const start = Date.now();
    let handle: fs.FileHandle | null = null;

    while (!handle) {
      try {
        handle = await fs.open(this.lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() - start > LOCK_TIMEOUT_MS) {
          throw new Error(`Timed out waiting for token lock: ${this.lockPath}`);
        }
        await sleep(LOCK_RETRY_MS);
      }
    }

    try {
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      return await fn();
    } finally {
      await handle.close().catch(() => undefined);
      await fs.unlink(this.lockPath).catch(() => undefined);
    }
  }
}
