import { Type, type Static } from "typebox";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TodoStore, Todo } from "./store.js";

// ─── Schema ───────────────────────────────────────────────────────────

export const statusSchema = Type.Union(
  [
    Type.Literal("pending"),
    Type.Literal("in_progress"),
    Type.Literal("inprogress"),
    Type.Literal("in-progress"),
    Type.Literal("active"),
    Type.Literal("doing"),
    Type.Literal("todo"),
    Type.Literal("notstarted"),
    Type.Literal("not-started"),
    Type.Literal("new"),
    Type.Literal("completed"),
    Type.Literal("complete"),
    Type.Literal("done"),
    Type.Literal("finished"),
  ],
  {
    description:
      "Current status. Canonical values are 'pending', 'in_progress', 'completed'; " +
      "common variants (todo, done, doing, active, complete, finished, ...) are accepted and normalized.",
  },
);

export const prioritySchema = Type.Union(
  [
    Type.Literal("high"),
    Type.Literal("medium"),
    Type.Literal("low"),
    Type.Literal("normal"),
    Type.Literal("critical"),
    Type.Literal("urgent"),
  ],
  {
    description:
      "Priority level. Canonical values are 'high', 'medium', 'low'; " +
      "variants (normal, critical, urgent) are accepted and normalized.",
  },
);

const todoItemSchema = Type.Object({
  content: Type.String({
    description: "Brief task description of the work item.",
  }),
  status: statusSchema,
  priority: prioritySchema,
});

export const todoListSchema = Type.Object({
  todos: Type.Array(todoItemSchema, {
    description:
      "The full todo list. Each call replaces the entire list (full-replacement model).",
  }),
});

export type TodoListInput = Static<typeof todoListSchema>;

type AnyStatus = string;
type AnyPriority = string;

export const STATUS_MAP: Record<string, Todo["status"]> = {
  pending: "pending",
  in_progress: "in_progress",
  inprogress: "in_progress",
  "in-progress": "in_progress",
  active: "in_progress",
  doing: "in_progress",
  todo: "pending",
  notstarted: "pending",
  "not-started": "pending",
  new: "pending",
  completed: "completed",
  complete: "completed",
  done: "completed",
  finished: "completed",
};

export const PRIORITY_MAP: Record<string, Todo["priority"]> = {
  high: "high",
  medium: "medium",
  low: "low",
  normal: "medium",
  critical: "high",
  urgent: "high",
};

function normalizeStatus(raw: AnyStatus): Todo["status"] | undefined {
  const lower = raw.toLowerCase().trim();
  return STATUS_MAP[lower];
}

function normalizePriority(raw: AnyPriority): Todo["priority"] | undefined {
  const lower = raw.toLowerCase().trim();
  return PRIORITY_MAP[lower];
}

export function normalizeTodo(item: { content?: unknown; status?: unknown; priority?: unknown }): Todo | null {
  if (typeof item.content !== "string") return null;
  const status = typeof item.status === "string" ? normalizeStatus(item.status) : undefined;
  const priority = typeof item.priority === "string" ? normalizePriority(item.priority) : undefined;
  if (!status || !priority) return null;
  return { content: item.content, status, priority };
}

// ─── Tool factory ─────────────────────────────────────────────────────

export function createTodoToolDefinition(
  store: TodoStore,
  appendEntry: (customType: string, data?: unknown) => void,
  onUpdated?: (ctx: ExtensionContext) => void,
): ToolDefinition {
  return {
    name: "todowrite",
    label: "Manage task list",
    description:
      "Create or replace the structured todo list for multi-step work. " +
      "Pass an object with a 'todos' array property. " +
      "Call this BEFORE starting implementation when the task involves 2+ files, " +
      "3+ steps, or delegated/cross-cutting work. Call it again after each item " +
      "completes to update statuses. Each call replaces the entire list.",
    promptSnippet:
      "Maintain a structured todo list before starting multi-step work and update it as items complete.",
    promptGuidelines: [
      "You MUST create a todo list before starting any task involving 2+ files, 3+ steps, or delegated work.",
      "Work in a CHECK → EXECUTE → UPDATE loop: check the todo, work the current item, update status immediately.",
      "Only ONE item may be in_progress at a time. Do not skip ahead.",
      "Each todo content should be a short, natural phrase — not a literal [WHERE]/[HOW]/[WHY] template. Use existing todos in the list as the style reference.",
      "Each item should be completable in 1-3 tool calls. If it needs more, split it.",
      "Call todowrite after EACH item to update statuses — not just at the start.",
      "After creating or updating the todo list, immediately EXECUTE the work for the current in_progress item — make the actual tool calls (edits, reads, commands). Do NOT end your turn after merely marking an item in_progress or announcing it. Never ask 'Would you like to proceed?'; if any incomplete items remain, continue straight into the next one. Only pause to ask the user when genuinely blocked or an action would have external/irreversible side effects (e.g. pushing, publishing, sending). When no incomplete items remain, the task is complete — report the result.",
    ],
    parameters: todoListSchema,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const rawTodos = (params as { todos: unknown[] }).todos;
      const todos: Todo[] = [];
      for (const item of rawTodos) {
        const normalized = normalizeTodo(item as Record<string, unknown>);
        if (normalized) todos.push(normalized);
      }
      store.replaceAll(todos);
      appendEntry("pi-todowrite/todos", todos);
      onUpdated?.(_ctx);

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