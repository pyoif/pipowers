import { describe, expect, test } from "vitest";
import {
  deepMerge,
  resolveMode,
  ADVISORY_DEFAULTS,
  STRICT_DEFAULTS,
  loadConfig,
  _resetForTest,
  saveConfig,
  detectLegacyConfig,
} from "../../extensions/pipowers-config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("deepMerge", () => {
  test("merges nested objects without mutating inputs", () => {
    const a = { x: 1, nested: { y: 2, z: 3 } };
    const b = { nested: { y: 99 } };
    const result = deepMerge(a, b);
    expect(result).toEqual({ x: 1, nested: { y: 99, z: 3 } });
    // Originals unchanged
    expect(a).toEqual({ x: 1, nested: { y: 2, z: 3 } });
    expect(b).toEqual({ nested: { y: 99 } });
  });

  test("later values win on scalar conflict", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test("arrays are replaced, not merged", () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
  });

  test("treats undefined values as missing", () => {
    expect(deepMerge({ a: 1 }, { a: undefined as any })).toEqual({ a: 1 });
  });
});

describe("ADVISORY_DEFAULTS", () => {
  test("plan tracker not required, strikes disabled", () => {
    expect(ADVISORY_DEFAULTS.enforcement).toBe("advisory");
    expect(ADVISORY_DEFAULTS.tunables.planTracker.required).toBe(false);
    expect(ADVISORY_DEFAULTS.tunables.workflow.processStrikeLimit).toBe(999);
    expect(ADVISORY_DEFAULTS.tunables.workflow.practiceStrikeLimit).toBe(2);
    expect(ADVISORY_DEFAULTS.tunables.nonInteractive.mode).toBe("advisory");
  });
});

describe("STRICT_DEFAULTS", () => {
  test("plan tracker required, process = 1, override allowed", () => {
    expect(STRICT_DEFAULTS.enforcement).toBe("strict");
    expect(STRICT_DEFAULTS.tunables.planTracker.required).toBe(true);
    expect(STRICT_DEFAULTS.tunables.workflow.processStrikeLimit).toBe(1);
    expect(STRICT_DEFAULTS.tunables.workflow.practiceStrikeLimit).toBe(2);
    expect(STRICT_DEFAULTS.tunables.workflow.allowOverride).toBe(true);
  });
});

function withTempHome<T>(fn: (home: string, cwd: string) => Promise<T> | T): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pipowers-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pipowers-cwd-"));
  _resetForTest({ home, cwd });
  const cleanup = () => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  };
  try {
    const result = fn(home, cwd);
    const promise = result instanceof Promise ? result : Promise.resolve(result);
    return promise.then(
      (v) => { cleanup(); return v; },
      (e) => { cleanup(); throw e; },
    );
  } catch (err) {
    cleanup();
    throw err;
  }
}

describe("loadConfig", () => {
  test("returns advisory defaults when neither file exists (no disk write)", async () => {
    await withTempHome(async (home, cwd) => {
      const result = await loadConfig();
      expect(result.config.enforcement).toBe("advisory");
      expect(result.config.tunables.planTracker.required).toBe(false);
      // No file should have been created
      expect(fs.existsSync(path.join(home, ".pi", "agent", "pipowers.toml"))).toBe(false);
      expect(fs.existsSync(path.join(cwd, ".pi", "pipowers.toml"))).toBe(false);
    });
  });

  test("returns global values when only global exists", async () => {
    await withTempHome(async (home) => {
      fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
      fs.writeFileSync(path.join(home, ".pi", "agent", "pipowers.toml"), 'enforcement = "strict"\n');
      const result = await loadConfig();
      expect(result.config.enforcement).toBe("strict");
      expect(result.config.tunables.planTracker.required).toBe(true);
    });
  });

  test("project overrides global per leaf", async () => {
    await withTempHome(async (home, cwd) => {
      fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
      fs.writeFileSync(path.join(home, ".pi", "agent", "pipowers.toml"), 'enforcement = "advisory"\n');
      fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
      fs.writeFileSync(path.join(cwd, ".pi", "pipowers.toml"), 'enforcement = "strict"\n');
      const result = await loadConfig();
      expect(result.config.enforcement).toBe("strict");
    });
  });

  test("malformed TOML returns defaults and reports error", async () => {
    await withTempHome(async (home) => {
      fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
      fs.writeFileSync(path.join(home, ".pi", "agent", "pipowers.toml"), "this is = not valid toml [[[");
      const result = await loadConfig();
      expect(result.config.enforcement).toBe("advisory");
    });
  });
});

describe("saveConfig", () => {
  test("creates file at global path with just the change when file does not exist", async () => {
    await withTempHome(async (home) => {
      await saveConfig("global", { enforcement: "strict" });
      const written = fs.readFileSync(path.join(home, ".pi", "agent", "pipowers.toml"), "utf-8");
      expect(written).toContain('enforcement = "strict"');
    });
  });

  test("creates file at project path with just the change when project file does not exist", async () => {
    await withTempHome(async (_home, cwd) => {
      await saveConfig("project", { enforcement: "custom" });
      const written = fs.readFileSync(path.join(cwd, ".pi", "pipowers.toml"), "utf-8");
      expect(written).toContain('enforcement = "custom"');
    });
  });

  test("deep-merges into existing file (preserves unrelated keys)", async () => {
    await withTempHome(async (home) => {
      const target = path.join(home, ".pi", "agent", "pipowers.toml");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'enforcement = "advisory"\nunrelated = "keep me"\n');
      await saveConfig("global", { enforcement: "strict" });
      const written = fs.readFileSync(target, "utf-8");
      expect(written).toContain('enforcement = "strict"');
      expect(written).toContain('unrelated = "keep me"');
    });
  });

  test("does not leave .tmp file behind on success", async () => {
    await withTempHome(async (home) => {
      await saveConfig("global", { enforcement: "advisory" });
      const target = path.join(home, ".pi", "agent", "pipowers.toml");
      expect(fs.existsSync(target + ".tmp")).toBe(false);
    });
  });

  test("saveConfig then loadConfig round-trips enforcement and tunables", async () => {
    await withTempHome(async () => {
      await saveConfig("global", {
        enforcement: "strict",
        tunables: STRICT_DEFAULTS.tunables,
      });
      const { config } = await loadConfig();
      expect(config.enforcement).toBe("strict");
      expect(config.tunables.planTracker.required).toBe(true);
    });
  });
});

describe("detectLegacyConfig", () => {
  test("detects legacy pi-superpowers-plus key in shared config files (logs once)", async () => {
    await withTempHome(async (home) => {
      // Simulate the user's old config: pi's shared global config with the legacy key
      const sharedConfig = path.join(home, ".pi", "agent", "config.json");
      fs.mkdirSync(path.dirname(sharedConfig), { recursive: true });
      fs.writeFileSync(sharedConfig, JSON.stringify({ "pi-superpowers-plus": { enforcement: "advisory" } }));
      const detected = await detectLegacyConfig();
      expect(detected).toBe(true);
    });
  });

  test("returns false when no legacy key is present", async () => {
    await withTempHome(async (home) => {
      const sharedConfig = path.join(home, ".pi", "agent", "config.json");
      fs.mkdirSync(path.dirname(sharedConfig), { recursive: true });
      fs.writeFileSync(sharedConfig, JSON.stringify({ unrelated: "value" }));
      const detected = await detectLegacyConfig();
      expect(detected).toBe(false);
    });
  });
});
