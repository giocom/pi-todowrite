import { describe, it, expect, beforeEach } from "vitest";
import { TodoStore, type Todo } from "../src/store.js";

describe("TodoStore", () => {
  let store: TodoStore;

  beforeEach(() => {
    store = new TodoStore();
  });

  // ── replaceAll ───────────────────────────────────────────────────────

  it("replaceAll sets todos and marks dirty", () => {
    const todos: Todo[] = [
      { content: "Task A", status: "pending", priority: "high" },
      { content: "Task B", status: "in_progress", priority: "medium" },
    ];
    store.replaceAll(todos);
    expect(store.getAll()).toHaveLength(2);
    expect(store.isDirty()).toBe(true);
  });

  it("replaceAll with empty array clears the list and marks dirty", () => {
    store.replaceAll([
      { content: "Task A", status: "pending", priority: "high" },
    ]);
    store.replaceAll([]);
    expect(store.getAll()).toHaveLength(0);
    expect(store.isDirty()).toBe(true);
  });

  it("replaceAll stores a copy, not a reference", () => {
    const original: Todo[] = [
      { content: "Task A", status: "pending", priority: "high" },
    ];
    store.replaceAll(original);
    original[0].content = "Mutated";
    expect(store.getAll()[0].content).toBe("Task A");
  });

  it("replaceAll can be called multiple times", () => {
    store.replaceAll([{ content: "A", status: "pending", priority: "low" }]);
    store.replaceAll([{ content: "B", status: "in_progress", priority: "medium" }]);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].content).toBe("B");
  });

  // ── getAll ────────────────────────────────────────────────────────────

  it("getAll returns a shallow copy", () => {
    store.replaceAll([
      { content: "Task A", status: "pending", priority: "high" },
    ]);
    const snapshot = store.getAll();
    snapshot.push({ content: "Injected", status: "pending", priority: "low" });
    expect(store.getAll()).toHaveLength(1);
  });

  it("getAll on empty store returns empty array", () => {
    expect(store.getAll()).toEqual([]);
  });

  // ── getIncomplete ─────────────────────────────────────────────────────

  it("getIncomplete filters out completed items", () => {
    store.replaceAll([
      { content: "Done", status: "completed", priority: "high" },
      { content: "Active", status: "in_progress", priority: "medium" },
      { content: "Queued", status: "pending", priority: "low" },
    ]);
    const incomplete = store.getIncomplete();
    expect(incomplete).toHaveLength(2);
    expect(incomplete[0].content).toBe("Active");
    expect(incomplete[1].content).toBe("Queued");
  });

  it("getIncomplete returns empty when all completed", () => {
    store.replaceAll([
      { content: "Done A", status: "completed", priority: "high" },
      { content: "Done B", status: "completed", priority: "medium" },
    ]);
    expect(store.getIncomplete()).toHaveLength(0);
  });

  it("getIncomplete returns empty on empty store", () => {
    expect(store.getIncomplete()).toEqual([]);
  });

  // ── getFirstIncomplete ───────────────────────────────────────────────

  it("getFirstIncomplete returns the first non-completed item", () => {
    store.replaceAll([
      { content: "Done", status: "completed", priority: "high" },
      { content: "Active", status: "in_progress", priority: "medium" },
      { content: "Queued", status: "pending", priority: "low" },
    ]);
    const first = store.getFirstIncomplete();
    expect(first).toBeDefined();
    expect(first!.content).toBe("Active");
  });

  it("getFirstIncomplete returns undefined when all completed", () => {
    store.replaceAll([
      { content: "Done", status: "completed", priority: "high" },
    ]);
    expect(store.getFirstIncomplete()).toBeUndefined();
  });

  it("getFirstIncomplete returns undefined on empty store", () => {
    expect(store.getFirstIncomplete()).toBeUndefined();
  });

  // ── hasTodos ─────────────────────────────────────────────────────────

  it("hasTodos returns false on empty store", () => {
    expect(store.hasTodos()).toBe(false);
  });

  it("hasTodos returns true after replaceAll with items", () => {
    store.replaceAll([
      { content: "Task", status: "pending", priority: "high" },
    ]);
    expect(store.hasTodos()).toBe(true);
  });

  it("hasTodos returns false after replaceAll with empty array", () => {
    store.replaceAll([
      { content: "Task", status: "pending", priority: "high" },
    ]);
    store.replaceAll([]);
    expect(store.hasTodos()).toBe(false);
  });

  // ── isDirty / clearDirty ─────────────────────────────────────────────

  it("isDirty is false on a fresh store", () => {
    expect(store.isDirty()).toBe(false);
  });

  it("isDirty becomes true after replaceAll", () => {
    store.replaceAll([
      { content: "Task", status: "pending", priority: "high" },
    ]);
    expect(store.isDirty()).toBe(true);
  });

  it("clearDirty resets the flag without losing data", () => {
    store.replaceAll([
      { content: "Task", status: "pending", priority: "high" },
    ]);
    store.clearDirty();
    expect(store.isDirty()).toBe(false);
    expect(store.getAll()).toHaveLength(1);
  });

  it("isDirty becomes true again after a second replaceAll post clearDirty", () => {
    store.replaceAll([
      { content: "A", status: "pending", priority: "high" },
    ]);
    store.clearDirty();
    store.replaceAll([
      { content: "B", status: "pending", priority: "high" },
    ]);
    expect(store.isDirty()).toBe(true);
  });

  // ── reset ─────────────────────────────────────────────────────────────

  it("reset clears all todos", () => {
    store.replaceAll([
      { content: "A", status: "pending", priority: "high" },
      { content: "B", status: "in_progress", priority: "medium" },
    ]);
    store.reset();
    expect(store.getAll()).toEqual([]);
    expect(store.hasTodos()).toBe(false);
    expect(store.getIncomplete()).toEqual([]);
    expect(store.getFirstIncomplete()).toBeUndefined();
  });

  it("reset clears the dirty flag", () => {
    store.replaceAll([
      { content: "A", status: "pending", priority: "high" },
    ]);
    store.reset();
    expect(store.isDirty()).toBe(false);
  });

  it("reset on already-empty store is a no-op", () => {
    store.reset();
    expect(store.getAll()).toEqual([]);
    expect(store.isDirty()).toBe(false);
  });
});