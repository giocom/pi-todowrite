import { describe, it, expect } from "vitest";
import { Compile } from "typebox/compile";
import {
  STATUS_MAP,
  PRIORITY_MAP,
  statusSchema,
  prioritySchema,
  todoListSchema,
  normalizeTodo,
} from "../src/todo-tool.js";

// ─── Schema ↔ map sync (regression guard for the "todo" validation bug) ──
// If a variant is added to STATUS_MAP/PRIORITY_MAP but forgotten in the
// schema union, these tests fail — preventing the validation-rejection
// regression where LLMs emit "todo"/"done" and the tool call is rejected.

describe("statusSchema accepts every STATUS_MAP key", () => {
  const check = Compile(statusSchema);
  for (const key of Object.keys(STATUS_MAP)) {
    it(`accepts "${key}"`, () => {
      expect(check.Check(key)).toBe(true);
    });
  }

  it("rejects unknown status values", () => {
    expect(check.Check("blocked")).toBe(false);
    expect(check.Check("weird")).toBe(false);
    expect(check.Check(123)).toBe(false);
  });
});

describe("prioritySchema accepts every PRIORITY_MAP key", () => {
  const check = Compile(prioritySchema);
  for (const key of Object.keys(PRIORITY_MAP)) {
    it(`accepts "${key}"`, () => {
      expect(check.Check(key)).toBe(true);
    });
  }

  it("rejects unknown priority values", () => {
    expect(check.Check("urgentzzz")).toBe(false);
    expect(check.Check("")).toBe(false);
  });
});

describe("todoListSchema accepts the full list with variant values", () => {
  const check = Compile(todoListSchema);

  it("accepts a list mixing canonical and variant statuses/priorities", () => {
    const payload = {
      todos: [
        { content: "Read docs", status: "in_progress", priority: "high" },
        { content: "Analyze", status: "todo", priority: "critical" },
        { content: "Implement", status: "doing", priority: "normal" },
        { content: "Verify", status: "done", priority: "low" },
      ],
    };
    expect(check.Check(payload)).toBe(true);
  });

  it("rejects a list with an unknown status (so the call fails loudly)", () => {
    const payload = {
      todos: [{ content: "X", status: "blocked", priority: "high" }],
    };
    expect(check.Check(payload)).toBe(false);
  });
});

// ─── normalizeTodo ───────────────────────────────────────────────────────

describe("normalizeTodo", () => {
  it("maps status + priority variants to canonical values", () => {
    expect(
      normalizeTodo({ content: "A", status: "todo", priority: "critical" }),
    ).toEqual({ content: "A", status: "pending", priority: "high" });

    expect(
      normalizeTodo({ content: "B", status: "done", priority: "normal" }),
    ).toEqual({ content: "B", status: "completed", priority: "medium" });

    expect(
      normalizeTodo({ content: "C", status: "doing", priority: "urgent" }),
    ).toEqual({ content: "C", status: "in_progress", priority: "high" });
  });

  it("returns null when content is not a string", () => {
    expect(normalizeTodo({ content: 123, status: "todo", priority: "high" })).toBeNull();
    expect(normalizeTodo({ status: "todo", priority: "high" })).toBeNull();
  });

  it("returns null when status or priority is unknown", () => {
    expect(normalizeTodo({ content: "X", status: "blocked", priority: "high" })).toBeNull();
    expect(normalizeTodo({ content: "X", status: "todo", priority: "weird" })).toBeNull();
  });
});
