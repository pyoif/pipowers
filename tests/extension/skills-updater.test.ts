import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { Logger } from "../../extensions/logging.js";
import {
  checkAndUpdate,
  downloadAndExtract,
  getLatestCommitSha,
  loadState,
  parseTar,
  saveState,
  shouldCheck,
} from "../../extensions/skills-updater.js";

describe("shouldCheck", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-updater-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns true when skills dir is missing", () => {
    expect(shouldCheck(path.join(tmpDir, "nonexistent"), "2026-01-01T00:00:00.000Z")).toBe(true);
  });
  test("returns true when skills dir is empty", () => {
    const d = path.join(tmpDir, "skills");
    fs.mkdirSync(d);
    expect(shouldCheck(d, "2026-01-01T00:00:00.000Z")).toBe(true);
  });
  test("returns true when skills dir has no .md files", () => {
    const d = path.join(tmpDir, "skills");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "foo.txt"), "hello");
    expect(shouldCheck(d, "2026-01-01T00:00:00.000Z")).toBe(true);
  });
  test("returns false when skills dir has .md and lastCheck is today", () => {
    const d = path.join(tmpDir, "skills");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "test.md"), "# Test");
    expect(shouldCheck(d, new Date().toISOString())).toBe(false);
  });
  test("returns true when skills dir has .md but lastCheck is different day", () => {
    const d = path.join(tmpDir, "skills");
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, "test.md"), "# Test");
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(shouldCheck(d, old)).toBe(true);
  });
});

describe("parseTar", () => {
  test("extracts files with correct content from fixture", () => {
    const compressed = fs.readFileSync("tests/fixtures/skills-test.tar.gz");
    const decompressed = zlib.gunzipSync(compressed);
    const entries = parseTar(Buffer.from(decompressed), "skills/");

    const brainstorm = entries.find((e) => e.relativePath === "brainstorming/SKILL.md");
    expect(brainstorm).toBeDefined();
    expect(brainstorm!.content.toString("utf-8")).toContain("Brainstorming");

    const wp = entries.find((e) => e.relativePath === "writing-plans/SKILL.md");
    expect(wp).toBeDefined();
    expect(wp!.content.toString("utf-8")).toContain("Writing Plans");
  });
  test("filters by prefix — excludes files outside skills/", () => {
    const compressed = fs.readFileSync("tests/fixtures/skills-test.tar.gz");
    const decompressed = zlib.gunzipSync(compressed);
    const entries = parseTar(Buffer.from(decompressed), "skills/");
    const readme = entries.find((e) => e.relativePath === "README.md");
    expect(readme).toBeUndefined();
    for (const e of entries) expect(e.relativePath).not.toContain("skills/");
  });
  test("handles empty archive (double zero blocks)", () => {
    const entries = parseTar(Buffer.alloc(1024, 0), "skills/");
    expect(entries).toEqual([]);
  });
  test("handles file with size 0", () => {
    const header = Buffer.alloc(512, 0);
    header.write("empty.md", 0, 9, "utf-8");
    header.write("0", 124, 12, "utf-8");
    header[156] = 0x30; // '0' = regular file
    const buf = Buffer.concat([header, Buffer.alloc(1024, 0)]);
    const entries = parseTar(buf, "");
    expect(entries).toHaveLength(1);
    expect(entries[0].relativePath).toBe("empty.md");
    expect(entries[0].content.length).toBe(0);
  });
});

describe("loadState / saveState", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-state-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loadState returns nulls when no state file exists", () => {
    const s = loadState(tmpDir);
    expect(s.sha).toBeNull();
    expect(s.lastCheck).toBeNull();
  });
  test("loadState returns saved state", () => {
    saveState(tmpDir, { sha: "abc123", lastCheck: "2026-01-01T00:00:00.000Z" });
    const s = loadState(tmpDir);
    expect(s.sha).toBe("abc123");
    expect(s.lastCheck).toBe("2026-01-01T00:00:00.000Z");
  });
  test("loadState returns nulls for corrupt JSON", () => {
    const piDir = path.join(tmpDir, ".pi");
    fs.mkdirSync(piDir);
    fs.writeFileSync(path.join(piDir, "pipowers-skills-sha.json"), "not json{{{");
    const s = loadState(tmpDir);
    expect(s.sha).toBeNull();
    expect(s.lastCheck).toBeNull();
  });
});

describe("getLatestCommitSha", () => {
  test("returns sha from git-upload-pack response", async () => {
    const pktLine =
      "001e# service=git-upload-pack\n0000" +
      "0155aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\\x00multi_ack thin-pack side-band-ack shallow no-progress include-tag\n" +
      "00411234567890abcdef1234567890abcdef12345678 refs/heads/main\n" +
      "0000";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(pktLine) }) as any;
    const sha = await getLatestCommitSha();
    expect(sha).toBe("1234567890abcdef1234567890abcdef12345678");
  });
  test("returns null on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    expect(await getLatestCommitSha()).toBeNull();
  });
  test("returns null when main branch not in refs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("003fabc123 refs/heads/other\n0000"),
    }) as any;
    expect(await getLatestCommitSha()).toBeNull();
  });
  test("returns null on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("down")) as any;
    expect(await getLatestCommitSha()).toBeNull();
  });
});

describe("downloadAndExtract", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-dl-"));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writes files on success", async () => {
    const compressed = fs.readFileSync("tests/fixtures/skills-test.tar.gz");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)),
    }) as any;

    const ok = await downloadAndExtract(tmpDir, "abc123");
    expect(ok).toBe(true);
    const c = fs.readFileSync(path.join(tmpDir, "brainstorming/SKILL.md"), "utf-8");
    expect(c).toContain("Brainstorming");
  });
  test("returns false on fetch error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("net")) as any;
    expect(await downloadAndExtract(tmpDir, "abc123")).toBe(false);
  });
  test("returns false on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    expect(await downloadAndExtract(tmpDir, "abc123")).toBe(false);
  });
});

function mockLog(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe("checkAndUpdate", () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-root-"));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("fetches immediately when skills dir missing (new install)", async () => {
    const compressed = fs.readFileSync("tests/fixtures/skills-test.tar.gz");
    const refsText =
      "001e# service=git-upload-pack\n0000" + "003fabc1234567890abcdef1234567890abcdef4321 refs/heads/main\n0000";
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(refsText) })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(
            compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength),
          ),
      });

    const l = mockLog();
    await checkAndUpdate(l, tmpRoot);
    const c = fs.readFileSync(path.join(tmpRoot, "skills", "brainstorming/SKILL.md"), "utf-8");
    expect(c).toContain("Brainstorming");
    expect(l.info).toHaveBeenCalledWith(expect.stringContaining("updated to commit"));
  });

  test("skips when throttled (skills exist, recent check)", async () => {
    const sd = path.join(tmpRoot, "skills");
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, "test.md"), "# Test");
    const piDir = path.join(tmpRoot, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(
      path.join(piDir, "pipowers-skills-sha.json"),
      JSON.stringify({ sha: "existing", lastCheck: new Date().toISOString() }),
    );

    const spy = vi.fn();
    global.fetch = spy;
    const l = mockLog();
    await checkAndUpdate(l, tmpRoot);
    expect(spy).not.toHaveBeenCalled();
    expect(l.debug).toHaveBeenCalledWith(expect.stringContaining("throttled"));
  });

  test("skips when sha matches (already current)", async () => {
    const sd = path.join(tmpRoot, "skills");
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, "test.md"), "# Test");
    const piDir = path.join(tmpRoot, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(
      path.join(piDir, "pipowers-skills-sha.json"),
      JSON.stringify({
        sha: "oldsha1234567890abcdef1234567890abcdef12",
        lastCheck: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
    );

    const refsText =
      "001e# service=git-upload-pack\n0000\n" + "0044oldsha1234567890abcdef1234567890abcdef12 refs/heads/main\n0000";
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(refsText) });
    const l = mockLog();
    await checkAndUpdate(l, tmpRoot);
    expect(l.debug).toHaveBeenCalledWith(expect.stringContaining("already at latest"));
  });

  test("fetches when sha differs (newer upstream)", async () => {
    const sd = path.join(tmpRoot, "skills");
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, "test.md"), "# Test");
    const piDir = path.join(tmpRoot, ".pi");
    fs.mkdirSync(piDir, { recursive: true });
    fs.writeFileSync(
      path.join(piDir, "pipowers-skills-sha.json"),
      JSON.stringify({
        sha: "oldsha00000000000000000000000000000000000000",
        lastCheck: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
    );

    const compressed = fs.readFileSync("tests/fixtures/skills-test.tar.gz");
    const refsText =
      "001e# service=git-upload-pack\n0000" + "0041newsha1234567890abcdef1234567890abcdef6789 refs/heads/main\n0000";
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(refsText) })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(
            compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength),
          ),
      });

    const l = mockLog();
    await checkAndUpdate(l, tmpRoot);
    expect(l.info).toHaveBeenCalledWith(expect.stringContaining("updated to commit"));
  });

  test("never throws even on complete failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("all broken"));
    const l = mockLog();
    await expect(checkAndUpdate(l, tmpRoot)).resolves.toBe(false);
    expect(l.warn).toHaveBeenCalled();
  });
});
