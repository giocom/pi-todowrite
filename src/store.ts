/**
 * In-memory todo store with persistence hooks.
 *
 * The store holds the current todo list for the session. It is populated by
 * the `todowrite` tool (called by the LLM) and restored on session resume
 * from the session file's custom entries.
 *
 * The store is pure logic — no dependency on the Pi extension API — so it
 * can be unit-tested in isolation.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoPriority = "high" | "medium" | "low";

export interface Todo {
  /** Brief description in format: [WHERE] [HOW] to [WHY] - expect [RESULT] */
  content: string;
  /** Current status of the task. */
  status: TodoStatus;
  /** Priority level. */
  priority: TodoPriority;
}

// ─── Store ─────────────────────────────────────────────────────────────────

/**
 * In-memory todo store. Tracks a dirty flag so callers know whether the
 * persisted state (in the session file) is stale.
 */
export class TodoStore {
  private todos: Todo[] = [];
  private dirty = false;

  /** Replace the entire todo list. Marks the store dirty. */
  replaceAll(todos: Todo[]): void {
    this.todos = todos.map((t) => ({ ...t }));
    this.dirty = true;
  }

  /** Get a deep copy of all todos. */
  getAll(): Todo[] {
    return this.todos.map((t) => ({ ...t }));
  }

  /** Get all todos that are not yet completed. */
  getIncomplete(): Todo[] {
    return this.todos.filter((t) => t.status !== "completed");
  }

  /** Get the first todo that is not completed (in_progress or pending). */
  getFirstIncomplete(): Todo | undefined {
    return this.todos.find((t) => t.status !== "completed");
  }

  /** Whether the store has any todos. */
  hasTodos(): boolean {
    return this.todos.length > 0;
  }

  /** Whether there are unsaved changes since the last clearDirty() call. */
  isDirty(): boolean {
    return this.dirty;
  }

  /** Mark the store as clean (e.g. after persisting to the session file). */
  clearDirty(): void {
    this.dirty = false;
  }

  /** Clear all state. Used on session shutdown or /todowrite reset. */
  reset(): void {
    this.todos = [];
    this.dirty = false;
  }
}