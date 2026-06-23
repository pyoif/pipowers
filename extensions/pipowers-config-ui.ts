/**
 * Pipowers UI: TUI status widget and /pipwr_config slash command.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { ConfigLayer, PipowersConfig } from "./pipowers-config.js";
import { loadConfig, saveConfig } from "./pipowers-config.js";

interface TaskLike {
  name: string;
  status: "pending" | "in_progress" | "complete";
}

export function formatStatusWidget(
  config: PipowersConfig,
  tasks: TaskLike[],
  effectiveSource: "global" | "project" | "default",
): string {
  if (config.enforcement === "advisory" && tasks.length === 0) return "";
  const modeStr = config.enforcement.toUpperCase();
  const planStr =
    tasks.length > 0
      ? ` [Plan: ${tasks.map((t) => (t.status === "complete" ? "✓" : t.status === "in_progress" ? "→" : "○")).join("")}]`
      : "";
  const sourceHint = effectiveSource === "project" ? " (project)" : effectiveSource === "global" ? " (global)" : "";
  return `[Mode: ${modeStr}]${planStr}  /pipwr_config${sourceHint}`;
}

export function buildStatusWidget(
  getConfig: () => PipowersConfig | null,
  getTasks: () => TaskLike[],
  getEffectiveSource: () => "global" | "project" | "default",
) {
  return (_tui: unknown, theme: Theme) => {
    const config = getConfig();
    if (!config) return new Text("", 0, 0);
    const text = formatStatusWidget(config, getTasks(), getEffectiveSource());
    if (!text) return new Text("", 0, 0);
    const color = config.enforcement === "advisory" ? "dim" : config.enforcement === "strict" ? "warning" : "success";
    return new Text(theme.fg(color as any, text), 0, 0);
  };
}
