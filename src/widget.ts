import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TodoStore, Todo } from "./store.js";

const WIDGET_KEY = "pi-todowrite-widget";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function statusMarker(status: Todo["status"]): string {
  switch (status) {
    case "in_progress": return `${BOLD}${CYAN}${">"}${RESET}`;
    case "completed":   return `${GREEN}[v]${RESET}`;
    default:            return "[ ]";
  }
}

function priorityTag(priority: Todo["priority"]): string {
  switch (priority) {
    case "high":   return `${RED}${"!"}${RESET}`;
    case "medium": return `${YELLOW}${"-"}${RESET}`;
    default:       return " ";
  }
}

function formatTodoLine(todo: Todo): string {
  const mark = statusMarker(todo.status);
  const pri = priorityTag(todo.priority);
  const isDone = todo.status === "completed";
  const text = isDone ? `${DIM}${todo.content}${RESET}` : todo.content;
  return `  ${mark} [${pri}] ${text}`;
}

export function renderTodoWidget(ctx: ExtensionContext, store: TodoStore): void {
  if (!ctx.hasUI || ctx.mode !== "tui") return;
  if (!store.hasTodos()) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }

  const todos = store.getAll();
  const incomplete = store.getIncomplete();
  const lines: string[] = [];

  if (incomplete.length === 0) {
    lines.push(`${GREEN}All tasks completed.${RESET}`);
  } else {
    lines.push(`${BOLD}Tasks:${RESET}`);
    for (const todo of todos) {
      lines.push(formatTodoLine(todo));
    }
    const remainingCount = incomplete.length;
    if (remainingCount > 0) {
      lines.push(`${DIM}${remainingCount} item${remainingCount > 1 ? "s" : ""} remaining.${RESET}`);
    }
  }

  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
}

export function clearTodoWidget(ctx: ExtensionContext): void {
  if (ctx.hasUI && ctx.mode === "tui") {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }
}