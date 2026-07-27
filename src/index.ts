import type { ExtensionAPI, ExtensionContext, Skill } from "@earendil-works/pi-coding-agent";
import { TodoStore, type Todo } from "./store.js";
import { createTodoToolDefinition } from "./todo-tool.js";
import { renderTodoWidget, renderFullTodoWidget, clearTodoWidget } from "./widget.js";
import { SkillMatcher } from "./skill-matcher.js";

const TODO_CUSTOM_TYPE = "pi-todowrite/todos";

function isCustomEntry(e: unknown): e is { customType: string; data?: unknown } {
  return (
    typeof e === "object" &&
    e !== null &&
    "customType" in e &&
    typeof (e as Record<string, unknown>).customType === "string"
  );
}

function extractTodos(data: unknown): Todo[] | null {
  if (!Array.isArray(data)) return null;
  const valid: Todo[] = [];
  for (const item of data) {
    if (
      typeof item === "object" &&
      item !== null &&
      "content" in item &&
      "status" in item &&
      "priority" in item
    ) {
      const r = item as Record<string, unknown>;
      if (
        typeof r.content === "string" &&
        (r.status === "pending" || r.status === "in_progress" || r.status === "completed") &&
        (r.priority === "high" || r.priority === "medium" || r.priority === "low")
      ) {
        valid.push({
          content: r.content,
          status: r.status,
          priority: r.priority,
        });
      }
    }
  }
  return valid.length > 0 ? valid : null;
}

export function buildTodoPromptBlock(store: TodoStore, skills?: Skill[]): string {
  // ── Available skills (shown BEFORE todo-management so the agent sees
  //    them when creating the todo list, not after) ───────────────────
  const preamble: string[] = [];

  if (skills && skills.length > 0) {
    preamble.push("<available-skills>");
    preamble.push("The following skills are loaded and available. Review them before creating the todo list — when a skill is relevant to a work item, consider using it during implementation.");
    preamble.push("");
    for (const s of skills) {
      preamble.push(`- ${s.name}: ${s.description}`);
    }
    preamble.push("</available-skills>");
  }

  const rules = [
    "<todo-management>",
    "You MUST use the todowrite tool to maintain a structured todo list during multi-step work.",
    "",
    "── WHEN TO CREATE ──",
    "Before starting any task that involves:",
    "- 2+ distinct files to modify, OR",
    "- 3+ steps, OR",
    "- Any delegated/cross-cutting work",
    "",
    "Skip todos for: single-file typo fixes, simple lookups, pure questions/explanations.",
    "",
    "── BEFORE CREATING TODOS ──",
    "Review the <available-skills> block above. If any loaded skill is relevant",
    "to a work item, reference it in the todo description so the implementation",
    "can use that skill's guidance.",
    "",
    "── WORKFLOW ──",
    "For EACH step of your work, follow this loop:",
    "1. CHECK the <current-todos> section below to see which item is in_progress.",
    "2. Execute the work for that item (1-3 tool calls max per item).",
    "3. UPDATE: immediately call todowrite to mark the item completed.",
    "4. REPEAT: the next pending item becomes in_progress.",
    "",
    "── RULES ──",
      "- Only ONE item may be in_progress at any time.",
      "- Do NOT skip ahead to the next item until the current one is completed.",
      "- When you CREATE the todo list, you MUST immediately mark the FIRST item in_progress and begin executing it in the SAME turn. Do not create a list where every item is pending and then stop to announce — start working right away.",
    "- If a <current-todos> block exists (an ACTIVE task with incomplete items), it is the AUTHORITATIVE task list. Follow it exactly.",
    "- A <previous-todos> block means the prior task is fully COMPLETE. Do NOT treat it as the current task — for a new instruction, call todowrite to create a FRESH list.",
    "- Each item must be completable in 1-3 tool calls. If it needs more, split it.",
    "- Follow the existing format convention from <current-todos> if present.",
    "- After every tool call, check whether the current todo item is done.",
    "- Language: always respond in the same language the user is writing in their messages. The todo list or tool text below may be written in another language (e.g. English technical terms) — that must NOT change your response language.",
    "</todo-management>",
  ];

  const lines = [...preamble, ...rules];

  if (store.hasTodos()) {
    const incomplete = store.getIncomplete();
    if (incomplete.length > 0) {
      // Active task in progress — present as the authoritative current list.
      lines.push("", "<current-todos>");
      const todos = store.getAll();
      for (const t of todos) {
        const mark =
          t.status === "in_progress" ? "in_progress" :
          t.status === "completed"   ? "completed"   :
                                        "pending";
        lines.push(`- [${mark}] ${t.content} (${t.priority})`);
      }
      const next = store.getFirstIncomplete();
      if (next) {
        lines.push("", `Continue with the next incomplete task: "${next.content}"`);
      }
      lines.push("</current-todos>");
    } else {
      // Prior task fully completed — surface as history, NOT as the active list,
      // so a new instruction isn't mistaken for "nothing left to do".
      lines.push("", '<previous-todos status="completed">');
      const todos = store.getAll();
      for (const t of todos) {
        lines.push(`- [completed] ${t.content} (${t.priority})`);
      }
      lines.push(
        "",
        "The above task is COMPLETE. For a new instruction, call todowrite to " +
          "create a FRESH todo list — do not treat the above as the current task.",
      );
      lines.push("</previous-todos>");
    }
  }

  // ── Skill recommendations (per-todo matching during execution) ─────
  if (skills && skills.length > 0) {
    const matcher = new SkillMatcher();
    const todos = store.getAll();
    const matched = matcher.matchSkillsToTodos(todos, skills);
    if (matched.length > 0) {
      lines.push(matcher.formatSkillRecommendations(matched));
    }
  }

  return "\n\n" + lines.join("\n");
}

function formatTodoListForNotify(store: TodoStore): string {
  const todos = store.getAll();
  if (todos.length === 0) return "No todos in the current session.";
  const lines = ["Todo List:"];
  for (const t of todos) {
    const mark =
      t.status === "in_progress" ? ">" :
      t.status === "completed"   ? "v" :
                                    " ";
    const pri =
      t.priority === "high"   ? "!" :
      t.priority === "medium" ? "-" :
                                  " ";
    lines.push(`  ${mark} [${pri}] ${t.content}`);
  }
  return lines.join("\n");
}

export default function piTodowrite(pi: ExtensionAPI): void {
  const store = new TodoStore();
  let widgetVisible = true;
  let compactMode = true;
  let autoResumeEnabled = true;
  let resumeDebounce = false;
  let lastCompactResumeAt = 0;
  const COMPACT_RESUME_COOLDOWN_MS = 30_000;
  let compactionPollInterval: ReturnType<typeof setInterval> | null = null;

  // Idle-nudge: detect a stalled turn (agent ended with incomplete todos but
  // made no tool calls — i.e. it announced "I'll do X" and stopped) and push it
  // to continue. Soft promptGuidelines can't force a model to keep going, so we
  // send an actual user message that triggers another turn.
  let turnMadeToolCall = false;
  let idleNudgeCount = 0;
  const IDLE_NUDGE_MAX = 3;

  let allCompletedTimer: ReturnType<typeof setTimeout> | null = null;

  const clearAllCompletedTimer = () => {
    if (allCompletedTimer) {
      clearTimeout(allCompletedTimer);
      allCompletedTimer = null;
    }
  };

  const renderWidget = (ctx: ExtensionContext) => {
    clearAllCompletedTimer();
    if (compactMode) {
      renderTodoWidget(ctx, store);
    } else {
      renderFullTodoWidget(ctx, store);
    }
    if (widgetVisible && store.hasTodos() && store.getIncomplete().length === 0) {
      allCompletedTimer = setTimeout(() => {
        clearTodoWidget(ctx);
      }, 3000);
    }
  };

  // ── Tool registration ────────────────────────────────────────────

  const onTodoUpdated = (ctx: ExtensionContext) => {
    if (widgetVisible) renderWidget(ctx);
  };

  const todoTool = createTodoToolDefinition(
    store,
    (customType, data) => {
      pi.appendEntry(customType, data);
    },
    onTodoUpdated,
  );

  pi.registerTool(todoTool);

  // ── System prompt injection ──────────────────────────────────────

  pi.on("before_agent_start", (event) => {
    turnMadeToolCall = false;
    const skills = event.systemPromptOptions?.skills;
    const todoBlock = buildTodoPromptBlock(store, skills);
    return {
      systemPrompt: event.systemPrompt + todoBlock,
    };
  });

  // ── Session restore ──────────────────────────────────────────────

  pi.on("session_start", async (event, ctx) => {
    store.reset();

    if (event.reason === "startup" || event.reason === "resume" || event.reason === "fork") {
      try {
        const entries = ctx.sessionManager.getEntries() as unknown[];
        const reversed = [...entries].reverse();
        for (const entry of reversed) {
          if (!isCustomEntry(entry)) continue;
          if (entry.customType !== TODO_CUSTOM_TYPE) continue;
          const todos = extractTodos(entry.data);
          if (todos) {
            store.replaceAll(todos);
            store.clearDirty();
            break;
          }
        }
      } catch {
        // Entries not available or parse error — start with empty store
      }
    }

    if (widgetVisible) renderWidget(ctx);
  });

  // ── Immediate widget refresh after tool execution ────────────────

  pi.on("tool_result", async (event, ctx) => {
    turnMadeToolCall = true;
    if (event.toolName === "todowrite" && widgetVisible) {
      renderWidget(ctx);
    }
  });

  // ── Auto-resume after compaction ─────────────────────────────────

  // After compaction the agent is stopped. Pi may not be idle at the very
  // first tick, so we poll briefly instead of a single fire-and-forget
  // check — otherwise the resume message could be silently skipped.
  const RESUME_MAX_ATTEMPTS = 150; // 150 × 200ms = 30s max wait for idle
  const RESUME_RETRY_MS = 200;

  pi.on("session_compact", async (event, ctx) => {
    if (!autoResumeEnabled) return;
    if (event.reason === "manual") return;
    if (event.willRetry) return;
    if (!store.hasTodos() || store.getIncomplete().length === 0) return;

    // Cooldown guard: prevent compaction → resume → compaction → resume loop
    const now = Date.now();
    if (now - lastCompactResumeAt < COMPACT_RESUME_COOLDOWN_MS) return;
    lastCompactResumeAt = now;

    if (resumeDebounce) return;
    resumeDebounce = true;

    const piSendUserMessage = pi.sendUserMessage.bind(pi);

    const trySend = (): boolean => {
      if (!ctx.isIdle()) return false;
      resumeDebounce = false;
      piSendUserMessage("Continue with the current task.");
      return true;
    };

    // Common case: already idle — send immediately, no polling delay.
    if (trySend()) return;

    let attempts = 0;

    if (compactionPollInterval) clearInterval(compactionPollInterval);
    compactionPollInterval = setInterval(() => {
      attempts++;
      if (trySend()) {
        if (compactionPollInterval) {
          clearInterval(compactionPollInterval);
          compactionPollInterval = null;
        }
      } else if (attempts >= RESUME_MAX_ATTEMPTS) {
        // Gave up waiting for idle; release the debounce so a future
        // compaction can still attempt a resume.
        if (compactionPollInterval) {
          clearInterval(compactionPollInterval);
          compactionPollInterval = null;
        }
        resumeDebounce = false;

        // Deferred fallback: if Pi takes unusually long to settle, try once
        // more after 10 seconds instead of giving up silently.
        setTimeout(() => {
          if (!ctx.isIdle()) return;
          if (!store.hasTodos() || store.getIncomplete().length === 0) return;
          piSendUserMessage("Continue with the current task.");
        }, 10_000);
      }
    }, RESUME_RETRY_MS);
  });

  pi.on("agent_end", async (_event, ctx) => {
    resumeDebounce = false;
    if (widgetVisible) renderWidget(ctx);

    // Idle-nudge (reliable counterpart to the soft promptGuidelines rule).
    // If the agent ended its turn having made NO tool calls while incomplete
    // todos remain, it stalled after announcing. Push it to continue.
    if (!autoResumeEnabled) return;
    if (store.getIncomplete().length === 0) return;
    if (turnMadeToolCall) {
      idleNudgeCount = 0; // real progress was made; reset the stall cap
      return;
    }
    if (idleNudgeCount >= IDLE_NUDGE_MAX) return; // give up to avoid a nudge loop
    if (!ctx.isIdle()) return;

    idleNudgeCount++;
    pi.sendUserMessage(
      "Continue with the current task. Proceed to the next incomplete todo item and execute its work — make the actual tool calls now. Do not stop to announce or ask for confirmation.",
    );
  });

  // ── Session shutdown ──────────────────────────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    clearAllCompletedTimer();
    if (compactionPollInterval) {
      clearInterval(compactionPollInterval);
      compactionPollInterval = null;
    }
    store.reset();
    clearTodoWidget(ctx);
  });

  // ── /todowrite command ───────────────────────────────────────────

  pi.registerCommand("todowrite", {
    description: "Manage or inspect the todo list",
    getArgumentCompletions: (prefix: string) => {
      const cmds = ["status", "show", "toggle", "compact", "full", "reset", "autoresume"];
      return cmds
        .filter((c) => c.startsWith(prefix))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      if (trimmed === "" || trimmed === "status" || trimmed === "show") {
        if (!store.hasTodos()) {
          ctx.ui.notify("No todos in the current session.", "info");
          return;
        }
        ctx.ui.notify(formatTodoListForNotify(store), "info");
        return;
      }

      if (trimmed === "compact") {
        compactMode = true;
        if (widgetVisible) renderWidget(ctx);
        ctx.ui.notify("Widget compact mode: only incomplete items shown.", "info");
        return;
      }

      if (trimmed === "full") {
        compactMode = false;
        if (widgetVisible) renderWidget(ctx);
        ctx.ui.notify("Widget full mode: all items shown.", "info");
        return;
      }

      if (trimmed === "toggle") {
        widgetVisible = !widgetVisible;
        if (widgetVisible) {
          renderWidget(ctx);
          ctx.ui.notify("Todo widget visible.", "info");
        } else {
          clearTodoWidget(ctx);
          ctx.ui.notify("Todo widget hidden.", "info");
        }
        return;
      }

      if (trimmed === "reset") {
        store.reset();
        pi.appendEntry(TODO_CUSTOM_TYPE, []);
        clearTodoWidget(ctx);
        ctx.ui.notify("Todo list cleared.", "info");
        return;
      }

      if (trimmed === "autoresume" || trimmed === "autoresume on" || trimmed === "autoresume off") {
        if (trimmed.endsWith("off")) {
          autoResumeEnabled = false;
          ctx.ui.notify("Auto-resume (compaction + idle stall): OFF.", "info");
        } else if (trimmed.endsWith("on")) {
          autoResumeEnabled = true;
          ctx.ui.notify("Auto-resume (compaction + idle stall): ON.", "info");
        } else {
          ctx.ui.notify(`Auto-resume: ${autoResumeEnabled ? "ON" : "OFF"}. Use /todowrite autoresume on|off.`, "info");
        }
        return;
      }

      ctx.ui.notify("Usage: /todowrite [status|show|compact|full|toggle|reset|autoresume]", "warning");
    },
  });
}