/**
 * Respect pi-skills-toggle's on-disk state when building the
 * <available-skills> block, so disabled skills don't leak into the
 * prompt through this extension's injection.
 *
 * Contract (shared with pi-skills-toggle, no code import — just the file):
 *   Global:   ~/.pi/agent/skills-toggle.json       { "disabled": [...] }
 *   Project:  <cwd>/.pi/skills-toggle.json         { "disabled": [...], "enabled": [...] }
 *
 * Effective:  disabled = (global.disabled ∪ project.disabled) \ project.enabled
 *
 * Defensive: if pi-skills-toggle is not installed the files don't exist
 * and this is a no-op — identical behavior to before.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Skill } from "@earendil-works/pi-coding-agent";

interface ToggleConfig {
  disabled: string[];
  enabled: string[];
}

function readConfig(path: string): ToggleConfig {
  if (!existsSync(path)) return { disabled: [], enabled: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<ToggleConfig>;
    return {
      disabled: Array.isArray(parsed.disabled)
        ? parsed.disabled.filter((x): x is string => typeof x === "string")
        : [],
      enabled: Array.isArray(parsed.enabled)
        ? parsed.enabled.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return { disabled: [], enabled: [] };
  }
}

export interface ToggleState {
  disabled: Set<string>;
  enabled: Set<string>;
}

export function loadToggleState(cwd: string): ToggleState {
  const global = readConfig(join(homedir(), ".pi", "agent", "skills-toggle.json"));
  const project = readConfig(join(cwd, ".pi", "skills-toggle.json"));
  return {
    disabled: new Set([...global.disabled, ...project.disabled]),
    enabled: new Set(project.enabled),
  };
}

/**
 * Drop skills that are toggled off (unless whitelisted by the project).
 * Returns the input untouched when there is nothing to filter.
 */
export function filterDisabledSkills(
  skills: Skill[] | undefined,
  cwd: string,
): Skill[] {
  if (!skills || skills.length === 0) return skills ?? [];
  const state = loadToggleState(cwd);
  if (state.disabled.size === 0) return skills;
  return skills.filter(
    (s) => state.enabled.has(s.name) || !state.disabled.has(s.name),
  );
}
