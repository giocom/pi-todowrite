import { describe, it, expect } from "vitest";
import { SkillMatcher, type MatchedSkill } from "../src/skill-matcher.js";
import type { Skill } from "@earendil-works/pi-coding-agent";
import type { Todo } from "../src/store.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────

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

const MOCK_SKILLS: Skill[] = [
  makeSkill({
    name: "typescript-advanced-types",
    description: "Master TypeScript's advanced type system including generics, conditional types, mapped types",
  }),
  makeSkill({
    name: "react-hook-form",
    description: "Guides React Hook Form usage for React forms with useForm and validation rules",
  }),
  makeSkill({
    name: "shadcn-ui",
    description: "Expert guidance for integrating and building applications with shadcn/ui components",
  }),
  makeSkill({
    name: "web-design-guidelines",
    description: "Review UI code for Web Interface Guidelines compliance, accessibility, and UX",
  }),
  makeSkill({
    name: "react-query-server-action-errors",
    description: "Guides handling Next.js Server Action errors with TanStack React Query useMutation",
  }),
  makeSkill({
    name: "tailwind-4-docs",
    description: "Comprehensive Tailwind CSS v4 documentation snapshot and workflow guidance",
  }),
];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("SkillMatcher.tokenize", () => {
  const matcher = new SkillMatcher();

  it("splits text into lowercase tokens", () => {
    const tokens = matcher.tokenize("Implement user authentication");
    expect(tokens.has("implement")).toBe(true);
    expect(tokens.has("user")).toBe(true);
    expect(tokens.has("authentication")).toBe(true);
  });

  it("preserves hyphenated compound words and their parts", () => {
    const tokens = matcher.tokenize("Use react-hook-form for forms");
    expect(tokens.has("react-hook-form")).toBe(true);
    expect(tokens.has("react")).toBe(true);
    expect(tokens.has("hook")).toBe(true);
    expect(tokens.has("form")).toBe(true);
  });

  it("filters out short tokens below minTokenLength", () => {
    const matcher = new SkillMatcher({ minTokenLength: 5 });
    const tokens = matcher.tokenize("Add UI form for data input and");
    expect(tokens.has("input")).toBe(true);  // 5 chars >= 5
    expect(tokens.has("form")).toBe(false);  // 4 chars < 5
    expect(tokens.has("data")).toBe(false);  // 4 chars < 5
    expect(tokens.has("and")).toBe(false);   // stop word + too short
  });

  it("filters out stop words", () => {
    const tokens = matcher.tokenize("The user and the form");
    expect(tokens.has("user")).toBe(true);
    expect(tokens.has("form")).toBe(true);
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("and")).toBe(false);
  });

  it("handles empty or short input gracefully", () => {
    expect(matcher.tokenize("").size).toBe(0);
    expect(matcher.tokenize("a").size).toBe(0);
    expect(matcher.tokenize("x y z").size).toBe(0);
  });
});

describe("SkillMatcher.matchSkillsToTodos", () => {
  const matcher = new SkillMatcher();

  it("returns empty when no todos match any skill", () => {
    const todos: Todo[] = [
      { content: "Set up CI pipeline", status: "pending", priority: "medium" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    expect(result).toHaveLength(0);
  });

  it("matches a todo item to a skill by keyword overlap", () => {
    const todos: Todo[] = [
      { content: "Set up form validation with React Hook Form", status: "in_progress", priority: "high" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const hookFormMatch = result.find((r) => r.skill.name === "react-hook-form");
    expect(hookFormMatch).toBeDefined();
    expect(hookFormMatch!.matchedKeywords.length).toBeGreaterThan(0);
    expect(hookFormMatch!.relevanceScore).toBeGreaterThan(0);
  });

  it("matches multiple skills for a todo when relevant", () => {
    const todos: Todo[] = [
      { content: "Build a form with shadcn UI components and validation", status: "pending", priority: "high" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    // Should match shadcn-ui at minimum
    expect(result.some((r) => r.skill.name === "shadcn-ui")).toBe(true);
  });

  it("skips completed todos", () => {
    const todos: Todo[] = [
      { content: "Set up form validation with React Hook Form", status: "completed", priority: "high" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    expect(result).toHaveLength(0);
  });

  it("returns up to maxRecommendations results", () => {
    const matcher = new SkillMatcher({ maxRecommendations: 2 });
    const todos: Todo[] = [
      { content: "Build React form with shadcn UI and validation rules using react hook form", status: "pending", priority: "high" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns empty when skills array is empty", () => {
    const todos: Todo[] = [
      { content: "Any task", status: "pending", priority: "low" },
    ];
    expect(matcher.matchSkillsToTodos(todos, [])).toHaveLength(0);
  });

  it("returns empty when todos array is empty", () => {
    expect(matcher.matchSkillsToTodos([], MOCK_SKILLS)).toHaveLength(0);
  });

  it("deduplicates the same skill matched to same todo", () => {
    // Even if the skill description has lots of overlap, each skill-todo
    // pair should appear at most once.
    const todos: Todo[] = [
      { content: "typescript types", status: "pending", priority: "medium" },
    ];
    const result = matcher.matchSkillsToTodos(todos, MOCK_SKILLS);
    const typeSkill = result.filter((r) => r.skill.name === "typescript-advanced-types");
    expect(typeSkill.length).toBeLessThanOrEqual(1);
  });
});

describe("SkillMatcher.formatSkillRecommendations", () => {
  const matcher = new SkillMatcher();

  it("returns empty string for empty matches", () => {
    expect(matcher.formatSkillRecommendations([])).toBe("");
  });

  it("formats matches into an XML block with skill references", () => {
    const todo: Todo = { content: "Add form validation", status: "in_progress", priority: "high" };
    const skill = makeSkill({
      name: "react-hook-form",
      description: "Guides React Hook Form usage",
    });
    const matched: MatchedSkill[] = [
      { skill, todo, relevanceScore: 0.5, matchedKeywords: ["form", "validation"] },
    ];

    const output = matcher.formatSkillRecommendations(matched);

    expect(output).toContain("<skill-recommendations>");
    expect(output).toContain("</skill-recommendations>");
    expect(output).toContain("react-hook-form");
    expect(output).toContain("Guides React Hook Form usage");
    expect(output).toContain("Add form validation");
  });

  it("formats multiple matches", () => {
    const skills: Skill[] = [
      makeSkill({ name: "react-hook-form", description: "Form validation skill" }),
      makeSkill({ name: "shadcn-ui", description: "UI component library" }),
    ];
    const todos: Todo[] = [
      { content: "Build form", status: "in_progress", priority: "high" },
      { content: "Style UI", status: "pending", priority: "medium" },
    ];
    const result = matcher.matchSkillsToTodos(todos, skills);

    const output = matcher.formatSkillRecommendations(result);
    expect(output).toContain("<skill-recommendations>");
    expect(output).toContain("react-hook-form");
    expect(output).toContain("shadcn-ui");
  });
});
