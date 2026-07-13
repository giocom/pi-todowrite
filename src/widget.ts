import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TodoStore, Todo } from "./store.js";

const WIDGET_KEY = "pi-todowrite-widget";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function statusIcon(status: Todo["status"]): string {
  switch (status) {
    case "in_progress": return `${BOLD}${CYAN}\u25b6${RESET}`;
    case "completed":   return `${GREEN}\u2713${RESET}`;
    default:            return `${DIM}\u25cb${RESET}`;
  }
}

function compactLine(todo: Todo): string {
  const icon = statusIcon(todo.status);
  const isDone = todo.status === "completed";
  const text = isDone ? `${DIM}${todo.content}${RESET}` : todo.content;
  return ` ${icon} ${text}`;
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
    lines.push(` ${GREEN}\u2713${RESET} ${GREEN}All tasks completed.${RESET}`);
  } else {
    // Only show incomplete items in the widget
    for (const todo of incomplete) {
      lines.push(compactLine(todo));
    }
    // Compact progress footer
    const total = todos.length;
    const done = total - incomplete.length;
    lines.push(
      `${DIM}${done}/${total}  \u2502  ${incomplete.length} remaining${RESET}`,
    );
  }

  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
}

export function renderFullTodoWidget(ctx: ExtensionContext, store: TodoStore): void {
  if (!ctx.hasUI || ctx.mode !== "tui") return;
  if (!store.hasTodos()) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }

  const todos = store.getAll();
  const lines: string[] = [];

  for (const todo of todos) {
    lines.push(compactLine(todo));
  }

  const incomplete = store.getIncomplete();
  const total = todos.length;
  const done = total - incomplete.length;
  lines.push(
    `${DIM}${done}/${total}  \u2502  ${incomplete.length} remaining${RESET}`,
  );

  ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
}

export function clearTodoWidget(ctx: ExtensionContext): void {
  if (ctx.hasUI && ctx.mode === "tui") {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }
}