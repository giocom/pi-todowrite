# pi-todowrite

Todo list management extension for [Pi](https://pi.dev). Automatically creates
structured todos before multi-step work and displays them in the TUI.

## What It Does

- Registers a `todowrite` tool that the LLM calls to manage a structured task list
- Injects a behavior rule into the system prompt so the agent creates todos before
  multi-step work (2+ files, 3+ steps, or delegated/cross-cutting work)
- Displays the current todo list as a widget in the TUI, updating in real time as
  the agent makes progress
- Persists todos in the session file so they survive compaction and session resume

## Install

```bash
pi install git:github.com/capyup/pi-todowrite
```

Or run directly for testing:

```bash
pi -e ./src/index.ts
```

## Commands

```
/todowrite              # Show current todo list
/todowrite status       # Same as above
/todowrite toggle       # Show/hide the TUI widget
/todowrite reset        # Clear all todos
```

## License

MIT