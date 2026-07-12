import { Type, type Static } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TodoStore, Todo } from "./store.js";

// ─── Schema ───────────────────────────────────────────────────────────

const todoItemSchema = Type.Object({
  content: Type.String({
    description: "Brief task description in format: [WHERE] [HOW] to [WHY] - expect [RESULT]",
  }),
  status: Type.Union(
    [
      Type.Literal("pending"),
      Type.Literal("in_progress"),
      Type.Literal("completed"),
    ],
    { description: "Current status of the task" },
  ),
  priority: Type.Union(
    [
      Type.Literal("high"),
      Type.Literal("medium"),
      Type.Literal("low"),
    ],
    { description: "Priority level: high, medium, or low" },
  ),
});

const todoListSchema = Type.Array(todoItemSchema, {
  description:
    "The full todo list. Each call replaces the entire list (full-replacement model).",
});

export type TodoListInput = Static<typeof todoListSchema>;

// ─── Tool factory ─────────────────────────────────────────────────────

export function createTodoToolDefinition(
  store: TodoStore,
  appendEntry: (customType: string, data?: unknown) => void,
  onUpdated?: () => void,
): ToolDefinition {
  return {
    name: "todowrite",
    label: "Manage task list",
    description:
      "Create or replace the structured todo list for multi-step work. " +
      "Call this BEFORE starting implementation when the task involves 2+ files, " +
      "3+ steps, or delegated/cross-cutting work. Call it again after each item " +
      "completes to update statuses. Each call replaces the entire list.",
    promptSnippet:
      "Maintain a structured todo list before starting multi-step work and update it as items complete.",
    promptGuidelines: [
      "Create a todo list BEFORE starting implementation when the task involves 2+ files to modify, 3+ steps, or any delegated/cross-cutting work.",
      "Skip todos for: single-file typo fixes, simple lookups, pure questions/explanations.",
      "One item in_progress at a time. Start the next only after completing the current.",
      "Mark items completed immediately after each finishes.",
      'Format each item content as: "[WHERE] [HOW] to [WHY] - expect [RESULT]".',
      "Each item should be completable in 1-3 tool calls. If it needs more, split it.",
    ],
    parameters: todoListSchema,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const todos = params as Todo[];
      store.replaceAll(todos);
      appendEntry("pi-todowrite/todos", todos);
      onUpdated?.();

      const remaining = store.getIncomplete().length;
      const completed = todos.filter((t) => t.status === "completed").length;
      const inProgress = todos.filter((t) => t.status === "in_progress").length;
      const summary = `Task list updated: ${todos.length} items — ${completed} completed, ${inProgress} in_progress, ${remaining} remaining.`;

      return {
        content: [{ type: "text", text: summary }],
        details: { count: todos.length, remaining, completed, inProgress },
      };
    },
  };
}