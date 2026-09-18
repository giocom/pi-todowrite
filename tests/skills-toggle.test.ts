import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@earendil-works/pi-coding-agent";
import { filterDisabledSkills, loadToggleState } from "../src/skills-toggle.js";

let fakeHome: string;
let projDir: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome };
});

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "skills-toggle-home-"));
  projDir = mkdtempSync(join(tmpdir(), "skills-toggle-proj-"));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projDir, { recursive: true, force: true });
});

function writeGlobal(disabled: string[], enabled: string[] = []) {
  mkdirSync(join(fakeHome, ".pi", "agent"), { recursive: true });
  writeFileSync(
    join(fakeHome, ".pi", "agent", "skills-toggle.json"),
    JSON.stringify({ disabled, enabled }),
  );
}

function writeProject(disabled: string[], enabled: string[] = []) {
  mkdirSync(join(projDir, ".pi"), { recursive: true });
  writeFileSync(
    join(projDir, ".pi", "skills-toggle.json"),
    JSON.stringify({ disabled, enabled }),
  );
}

const sourceInfo = {
  path: "/mock/path",
  source: "test",
  scope: "user" as const,
  origin: "package" as const,
};

function makeSkill(name: string): Skill {
  return {
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    name,
    description: `desc for ${name}`,
    sourceInfo,
    disableModelInvocation: false,
  };
}

const skills = [makeSkill("pdf"), makeSkill("xlsx"), makeSkill("ast-grep")];
const names = (list: readonly Skill[]) => list.map((s) => s.name);

describe("loadToggleState", () => {
  it("returns empty state when no config files exist", () => {
    const state = loadToggleState(projDir);
    expect(state.disabled.size).toBe(0);
    expect(state.enabled.size).toBe(0);
  });

  it("merges global + project disabled, project enabled is a whitelist", () => {
    writeGlobal(["pdf", "xlsx"]);
    writeProject(["pptx"], ["pdf"]);
    const state = loadToggleState(projDir);
    expect([...state.disabled].sort()).toEqual(["pdf", "pptx", "xlsx"]);
    expect([...state.enabled]).toEqual(["pdf"]);
  });

  it("tolerates invalid JSON", () => {
    writeGlobal(["pdf"]);
    mkdirSync(join(projDir, ".pi"), { recursive: true });
    writeFileSync(join(projDir, ".pi", "skills-toggle.json"), "{ not json");
    const state = loadToggleState(projDir);
    expect([...state.disabled]).toEqual(["pdf"]);
  });
});

describe("filterDisabledSkills", () => {
  it("is a no-op when pi-skills-toggle is not installed (no config files)", () => {
    expect(filterDisabledSkills(skills, projDir)).toEqual(skills);
  });

  it("removes globally disabled skills", () => {
    writeGlobal(["pdf", "xlsx"]);
    expect(names(filterDisabledSkills(skills, projDir)!)).toEqual(["ast-grep"]);
  });

  it("removes project-disabled skills", () => {
    writeProject(["xlsx"]);
    expect(names(filterDisabledSkills(skills, projDir)!)).toEqual(["pdf", "ast-grep"]);
  });

  it("project enabled whitelists a globally disabled skill", () => {
    writeGlobal(["pdf", "xlsx"]);
    writeProject([], ["pdf"]);
    expect(names(filterDisabledSkills(skills, projDir)!)).toEqual(["pdf", "ast-grep"]);
  });

  it("returns empty array for undefined input", () => {
    expect(filterDisabledSkills(undefined, projDir)).toEqual([]);
  });

  it("removes everything that is disabled", () => {
    writeGlobal(["pdf", "xlsx", "ast-grep"]);
    expect(names(filterDisabledSkills(skills, projDir)!)).toEqual([]);
  });
});
