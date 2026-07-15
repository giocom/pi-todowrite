import { describe, it, expect } from "vitest";
import { TodoStore, type Todo } from "../src/store.js";
import { buildTodoPromptBlock } from "../src/index.js";

function seed(store: TodoStore, todos: Todo[]): void {
  store.replaceAll(todos);
}

/** A block tag is emitted on its own line; the rules text only mentions it inline. */
function hasBlockTag(block: string, tag: string): boolean {
  return block.split("\n").some((line) => line.trim() === tag);
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
});
