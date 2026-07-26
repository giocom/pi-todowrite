import { describe, it, expect } from "vitest";
import type { Skill } from "@earendil-works/pi-coding-agent";
import { TodoStore, type Todo } from "../src/store.js";
import { buildTodoPromptBlock } from "../src/index.js";

function seed(store: TodoStore, todos: Todo[]): void {
  store.replaceAll(todos);
}

/** A block tag is emitted on its own line; the rules text only mentions it inline. */
function hasBlockTag(block: string, tag: string): boolean {
  return block.split("\n").some((line) => line.trim() === tag);
}

const sourceInfo = {
  path: "/mock/path",
  source: "test",
  scope: "user" as const,
  origin: "package" as const,
};

function makeSkill(overrides: Partial<Skill> & { name: string; description: string }): Skill {
  return {
    filePath: `/skills/${overrides.name}/SKILL.md`,
    baseDir: `/skills/${overrides.name}`,
    sourceInfo,
    disableModelInvocation: false,
    ...overrides,
  };
}

describe("buildTodoPromptBlock", () => {
  it("injects an ACTIVE <current-todos> block when items are incomplete", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Read docs", status: "in_progress", priority: "high" },
      { content: "Implement", status: "pending", priority: "medium" },
    ]);

    const block = buildTodoPromptBlock(store);

    expect(hasBlockTag(block, "<current-todos>")).toBe(true);
    expect(block).toContain("Continue with the next incomplete task");
    expect(hasBlockTag(block, '<previous-todos status="completed">')).toBe(false);
  });

  it("injects a non-authoritative <previous-todos> block when all completed", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Read docs", status: "completed", priority: "high" },
      { content: "Implement", status: "completed", priority: "medium" },
    ]);

    const block = buildTodoPromptBlock(store);

    expect(hasBlockTag(block, '<previous-todos status="completed">')).toBe(true);
    expect(block).toContain("create a FRESH todo list");
    // A completed previous task must NOT be presented as the authoritative
    // current list — otherwise a new instruction looks like "nothing to do".
    expect(hasBlockTag(block, "<current-todos>")).toBe(false);
  });

  it("omits both blocks when the store is empty", () => {
    const store = new TodoStore();
    const block = buildTodoPromptBlock(store);

    expect(block).toContain("<todo-management>");
    expect(hasBlockTag(block, "<current-todos>")).toBe(false);
    expect(hasBlockTag(block, '<previous-todos status="completed">')).toBe(false);
  });

  // ── <available-skills> (shown before todo-management) ──────────────

  it("injects <available-skills> when skills exist, even with empty store", () => {
    const store = new TodoStore();
    const skills: Skill[] = [
      makeSkill({ name: "react-hook-form", description: "Form skill" }),
    ];

    const block = buildTodoPromptBlock(store, skills);

    expect(hasBlockTag(block, "<available-skills>")).toBe(true);
    // Must appear before <todo-management>
    expect(block.indexOf("<available-skills>")).toBeLessThan(block.indexOf("<todo-management>"));
    expect(block).toContain("react-hook-form");
    expect(block).toContain("Form skill");
  });

  it("omits <available-skills> when skills is undefined", () => {
    const store = new TodoStore();
    const block = buildTodoPromptBlock(store);
    expect(hasBlockTag(block, "<available-skills>")).toBe(false);
  });

  it("omits <available-skills> when skills array is empty", () => {
    const store = new TodoStore();
    const block = buildTodoPromptBlock(store, []);
    expect(hasBlockTag(block, "<available-skills>")).toBe(false);
  });

  it("injects <available-skills> before <todo-management> even when todos exist", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Read docs", status: "in_progress", priority: "high" },
    ]);

    const skills: Skill[] = [
      makeSkill({ name: "react-hook-form", description: "Form skill" }),
    ];

    const block = buildTodoPromptBlock(store, skills);

    expect(hasBlockTag(block, "<available-skills>")).toBe(true);
    // available-skills comes before todo-management
    expect(block.indexOf("<available-skills>")).toBeLessThan(block.indexOf("<todo-management>"));
    // both blocks present
    expect(hasBlockTag(block, "<current-todos>")).toBe(true);
  });

  // ── <skill-recommendations> (per-todo matching) ────────────────────

  it("injects <skill-recommendations> when skills match todos", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Add form validation with react hook form", status: "in_progress", priority: "high" },
    ]);

    const skills: Skill[] = [
      makeSkill({
        name: "react-hook-form",
        description: "Guides React Hook Form usage for React forms",
      }),
      makeSkill({
        name: "typescript-advanced-types",
        description: "Master advanced TypeScript types",
      }),
    ];

    const block = buildTodoPromptBlock(store, skills);

    expect(hasBlockTag(block, "<skill-recommendations>")).toBe(true);
    expect(block).toContain("react-hook-form");
    expect(block).toContain("Guides React Hook Form usage for React forms");
  });

  it("omits <skill-recommendations> when skills array is empty", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Add form validation", status: "in_progress", priority: "high" },
    ]);

    const block = buildTodoPromptBlock(store, []);

    expect(hasBlockTag(block, "<skill-recommendations>")).toBe(false);
  });

  it("omits <skill-recommendations> when skills are undefined (backward compat)", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Add form validation", status: "in_progress", priority: "high" },
    ]);

    const block = buildTodoPromptBlock(store); // no skills arg

    expect(hasBlockTag(block, "<skill-recommendations>")).toBe(false);
  });

  it("omits <skill-recommendations> when no skill matches any todo", () => {
    const store = new TodoStore();
    seed(store, [
      { content: "Set up CI pipeline on GitHub Actions", status: "in_progress", priority: "high" },
    ]);

    const skills: Skill[] = [
      makeSkill({
        name: "react-hook-form",
        description: "Guides React Hook Form usage",
      }),
    ];

    const block = buildTodoPromptBlock(store, skills);

    expect(hasBlockTag(block, "<skill-recommendations>")).toBe(false);
  });
});
