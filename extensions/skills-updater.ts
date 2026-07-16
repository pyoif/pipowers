import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import type { Logger } from "./logging.js";

interface TarEntry {
  relativePath: string;
  content: Buffer;
}

interface SkillsState {
  sha: string | null;
  lastCheck: string | null;
}

function readNullTerminated(buf: Buffer, start: number, maxLen: number): string {
  const end = buf.indexOf(0, start);
  const len = end >= 0 && end < start + maxLen ? end - start : maxLen;
  return buf.toString("utf-8", start, start + len);
}

export function shouldCheck(skillsDir: string, lastCheck: string): boolean {
  try {
    const entries = fs.readdirSync(skillsDir);
    const hasMd = entries.some((e) => e.endsWith(".md"));
    if (!hasMd) return true;
  } catch {
    return true;
  }
  const elapsed = Date.now() - new Date(lastCheck).getTime();
  return elapsed >= 24 * 60 * 60 * 1000;
}

export function parseTar(buffer: Buffer, prefix: string): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    if (header.every((b) => b === 0)) {
      const next = buffer.subarray(offset + 512, offset + 1024);
      if (offset + 1024 > buffer.length || next.every((b) => b === 0)) break;
      offset += 512;
      continue;
    }

    const name = readNullTerminated(header, 0, 100);
    const sizeStr = readNullTerminated(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (!name) continue;

    const slashIdx = name.indexOf("/");
    const relativePath = slashIdx >= 0 ? name.substring(slashIdx + 1) : name;

    if (typeflag === "5") continue; // directory

    if (typeflag !== "0" && typeflag !== "\x00") {
      offset += Math.ceil(size / 512) * 512;
      continue;
    }

    const content = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (relativePath.startsWith(prefix)) {
      entries.push({ relativePath: relativePath.substring(prefix.length), content });
    }
  }

  return entries;
}

function statePath(cwd: string): string {
  return path.join(cwd, ".pi", "pipowers-skills-sha.json");
}

export function loadState(cwd: string): SkillsState {
  try {
    const raw = fs.readFileSync(statePath(cwd), "utf-8");
    const data = JSON.parse(raw);
    return {
      sha: typeof data.sha === "string" ? data.sha : null,
      lastCheck: typeof data.lastCheck === "string" ? data.lastCheck : null,
    };
  } catch {
    return { sha: null, lastCheck: null };
  }
}

export function saveState(cwd: string, state: { sha: string; lastCheck: string }): void {
  const fp = statePath(cwd);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2), "utf-8");
}

const REPO_URL = "https://github.com/obra/superpowers.git";
const ARCHIVE_URL = "https://github.com/obra/superpowers/archive/main.tar.gz";

export async function getLatestCommitSha(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(`${REPO_URL}/info/refs?service=git-upload-pack`, {
      headers: { "User-Agent": "pipowers" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;

    const text = await resp.text();
    // pkt-line: 4-char hex length prefix then data. SHA is at data[0:40] on the refs/heads/main line.
    const mainLine = text.split("\n").find((l) => l.includes("refs/heads/main"));
    if (mainLine && mainLine.length >= 44) return mainLine.substring(4, 44);
    return null;
  } catch {
    return null;
  }
}

export async function downloadAndExtract(skillsDir: string, _sha: string): Promise<boolean> {
  let compressed: ArrayBuffer;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const resp = await fetch(ARCHIVE_URL, {
      headers: { "User-Agent": "pipowers" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!resp.ok) return false;
    compressed = await resp.arrayBuffer();
  } catch {
    return false;
  }

  let decompressed: Buffer;
  try {
    decompressed = zlib.gunzipSync(new Uint8Array(compressed));
  } catch {
    return false;
  }

  let entries: TarEntry[];
  try {
    entries = parseTar(decompressed, "skills/");
  } catch {
    return false;
  }

  try {
    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry.relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, entry.content);
    }
    return true;
  } catch {
    return false;
  }
}

export async function checkAndUpdate(log: Logger, packageRoot: string): Promise<void> {
  const skillsDir = path.join(packageRoot, "skills");

  try {
    const saved = loadState(packageRoot);

    if (!shouldCheck(skillsDir, saved.lastCheck ?? new Date(0).toISOString())) {
      log.debug("skills-update: throttled");
      return;
    }

    const latestSha = await getLatestCommitSha();
    if (!latestSha) {
      log.warn("skills-update: could not fetch latest commit sha");
      return;
    }

    if (saved.sha === latestSha) {
      log.debug(`skills-update: already at latest (${latestSha.slice(0, 7)})`);
      saveState(packageRoot, { sha: latestSha, lastCheck: new Date().toISOString() });
      return;
    }

    const ok = await downloadAndExtract(skillsDir, latestSha);
    if (!ok) {
      log.warn("skills-update: download and extract failed");
      return;
    }

    log.info(`skills-update: updated to commit ${latestSha.slice(0, 7)}`);
    saveState(packageRoot, { sha: latestSha, lastCheck: new Date().toISOString() });
  } catch (err) {
    log.warn(`skills-update: unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
