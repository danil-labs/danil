#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, freemem, tmpdir, totalmem } from "node:os";
import { dirname, join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { SKIPPED_EXIT_CODE, walkFiles } from "./git.mjs";
import { changedFiles, classify, stepFiles, testReader, touches } from "./verify-scope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(root, "src-tauri");
const PLATFORM = { win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] ?? process.platform;
const OTHER_PLATFORMS =
  process.platform === "darwin"
    ? "Windows and Linux"
    : process.platform === "win32"
      ? "macOS and Linux"
      : "Windows and macOS";

if (process.argv.includes("--remote")) {
  const { runRemote } = await import("./verify-remote.mjs");
  process.exit(await runRemote(process.argv.slice(2)));
}

const SKIP_RUST = process.argv.includes("--no-cargo");
const QUICK = process.argv.includes("--quick");
const BASE = process.argv.find((argument) => argument.startsWith("--base="))?.slice(7) ?? "origin/dev";
const rustBuild = { command: "cargo", env: process.env };

function undocumentedGuards() {
  const catalog = readFileSync(join(root, "docs/guards.md"), "utf8");
  const documented = new Set(
    catalog.split("\n").filter((line) => line.startsWith("|")).flatMap((line) =>
      [...line.matchAll(/`((?:scripts(?:\/guards)?|tests\/perf)\/[a-z-]+\.mjs)`/g)].map((match) => match[1]),
    ),
  );
  const scheduled = new Set(
    [...steps, ...rustSteps]
      .flatMap(([, , args = []]) => args)
      .filter((argument) => typeof argument === "string")
      .map((argument) => relative(root, argument).replaceAll("\\", "/"))
      .filter((argument) => (argument.startsWith("scripts/") || argument.startsWith("tests/perf/")) && argument.endsWith(".mjs") && !argument.includes(".test.")),
  );
  return [
    ...[...scheduled].filter((path) => !documented.has(path)).map((path) => `Step without a row: ${path}`),
    ...[...documented].filter((path) => !scheduled.has(path)).map((path) => `Row without a step: ${path}`),
  ];
}

const engineStep = ["The bundled engine is in place", process.execPath, [join(root, "scripts/engine.mjs"), "sidecar"], root];
const cliStep = ["The CLI forwards to the engine without opening a window", process.execPath, ["--test", join(root, "tests/unit/cli-forward.test.mjs")], root];
const rustSteps = [
  engineStep,
  ["cargo fmt", "cargo", ["fmt", "--check", "--", "--config-path", "rustfmt.toml"], backend],
  ["cargo check", rustBuild.command, ["check", "--locked", "--all-targets"], backend],
  ["cargo clippy", rustBuild.command, ["clippy", "--locked", "--all-targets"], backend],
  ["The window has permission for what it asks", process.execPath, [join(root, "scripts/guards/permissions.mjs")], root],
  ["cargo test", rustBuild.command, ["test", "--locked"], backend],
];

const steps = [
  ...(SKIP_RUST ? [] : [engineStep]),
  cliStep,
  ["The Danil launchers keep the CLI and refuse collisions", process.execPath, ["--test", join(root, "tests/unit/cli-path.test.mjs")], root],
  ["The project search merges repositories without duplicates", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/project-repositories.test.ts")], root],
  ["The scope of --quick comes from the diff and falls back to the full chain when in doubt", process.execPath, ["--test", join(root, "tests/unit/verify-scope.test.mjs")], root],
  ["All code is reviewable", process.execPath, [join(root, "scripts/guards/reviewable.mjs")], root],
  [
    "A guard without git says so and does not kill the chain",
    process.execPath,
    ["--test", join(root, "tests/unit/tree-git.test.mjs")],
    root,
  ],
  ["No process opens a console on Windows", process.execPath, [join(root, "scripts/guards/console-window.mjs")], root],
  ["No process is awaited without a deadline", process.execPath, [join(root, "scripts/guards/processes.mjs")], root],
  ["The window is not built twice", process.execPath, [join(root, "scripts/guards/window.mjs")], root],
  ["Docs do not point to a missing file", process.execPath, [join(root, "scripts/guards/doc-paths.mjs")], root],
  ["Someone emits what the interface listens to", process.execPath, [join(root, "scripts/guards/bridge.mjs")], root],
  ["No backend error gets flattened", process.execPath, [join(root, "scripts/guards/service-errors.mjs")], root],
  ["Someone invokes what the backend registers", process.execPath, [join(root, "scripts/guards/commands.mjs")], root],
  ["The pinned engine speaks the copied contract", process.execPath, [join(root, "scripts/guards/contract.mjs")], root],
  ["The artifact runtime does not break silently", process.execPath, [join(root, "scripts/guards/artifact.mjs")], root],
  ["Carrying work to another machine copies in parts, resumes from the failed one and cleans up on cancel", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/carry-work.test.ts")], root],
  ["Chat visuals arrive in parts and fall back to tree_show on an older engine", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/chat-visual-parts.test.ts")], root],
  ["An agent row names its readers only when they differ from the rest", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/agent-readers.test.ts")], root],
  ["The sidebar snapshot is saved bounded and debounced", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/shell-cache.test.ts")], root],
  ["A local orchestrator config starts mcp serve with its credential", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/orchestrator-snippets.test.ts")], root],
  ["History pages join by their turns and a failure can be retried", process.execPath, ["--test", "--experimental-strip-types", join(root, "..", "..", "packages/chat/test/history.test.ts")], root],
  ["Thread rows keep their key when saved and when prepending", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/thread-rows.test.ts")], root],
  ["The Folder panel retries by itself, does not pile up reads and keeps the last good result", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/tree-loader.test.ts")], root],
  ["The window opens with the light list and startup confirms it without skipping a denial", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/early-startup.test.ts")], root],
  ["The release note comes in the app language", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/release-notes.test.ts")], root],
  ["An agent page paginates tasks without separating subtasks from their parent", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/agent-page-tasks.test.ts")], root],
  ["The launched subtasks rail drops the finished ones", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/delegated-rail.test.ts")], root],
  ["Task search ignores accents and finds several words", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/task-search.test.ts")], root],
  ["The Typst view only goes with a .typ, not with the file opened next", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/typst-scope.test.ts")], root],
  ["The agents dock sorts by state and fits in one row", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/agent-dock.test.ts")], root],
  ["The sidebar joins tasks from all folders without repeating them", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/sidebar-tasks.test.ts")], root],
  ["The sidebar filters by folder and agent and splits into sections or groups", process.execPath, ["--conditions=browser", "--test", "--experimental-strip-types", join(root, "tests/unit/sidebar-view.test.ts")], root],
  ["The viewer keeps navigation and rejects retired channels", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/artifact-viewer.test.ts"), join(root, "tests/unit/artifact-download.test.ts")], root],
  ["The window lets no material out", process.execPath, [join(root, "scripts/guards/csp.mjs")], root],
  ["The terminal theme does not repaint the chrome", process.execPath, [join(root, "scripts/guards/terminal-themes.mjs")], root],
  ["The catalog defines what the code asks for", process.execPath, [join(root, "scripts/guards/locales.mjs")], root],
  ["Font sizes come from the scale", process.execPath, ["--experimental-strip-types", join(root, "scripts/guards/design-tokens.mjs")], root],
  ["The shared packages pass their tests", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/tasks/test/*.test.ts"), join(root, "../../packages/attention/test/*.test.ts"), join(root, "../../packages/design/test/*.test.ts"), join(root, "../../packages/chat/test/*.test.ts")], root],
  ["`cn` recognizes the text scale", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/cn-text-scale.test.ts")], root],
  ["The design package says the same as the desktop", process.execPath, ["--experimental-strip-types", join(root, "scripts/guards/shared-design.mjs")], root],
  ["What is already translated does not get hardcoded again", process.execPath, [join(root, "scripts/guards/literals.mjs")], root],
  ["Comments do not grow or argue", process.execPath, [join(root, "scripts/guards/comments.mjs")], root],
  ["Source reads in tests respect the reviewed quota", process.execPath, [join(root, "scripts/guards/test-policy.mjs")], root],
  ["Tree icons are the package's", process.execPath, [join(root, "scripts/icons.mjs"), "--check"], root],
  ["Dropping a file does not depend on the screen", process.execPath, [join(root, "scripts/guards/drop.mjs")], root],
  ["No infinite animation repaints at 60 fps", process.execPath, [join(root, "scripts/guards/animations.mjs")], root],
  [
    "The trigger keeps the click that opens it",
    process.execPath,
    ["--test", join(root, "tests/unit/triggers.test.mjs")],
    root,
  ],
  [
    "A request fan-out respects its cap",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/pool.test.ts")],
    root,
  ],
  ["La cola remota corre uno a la vez, limpia entre corridas y devuelve el exit real", process.execPath, ["--test", join(root, "tests/unit/verify-queue.test.mjs")], root],
  ["El barrido de target no toca lo que un cargo usa", process.execPath, ["--test", join(root, "tests/unit/sweep-targets.test.mjs")], root],
  [
    "A saved chat background that no longer exists paints nothing",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/chat-background.test.ts")],
    root,
  ],
  [
    "The chat background is not erased by an older engine and does not cross workspaces",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/chat-background-engine.test.ts")],
    root,
  ],
  [
    "An agent name gives an identifier the backend accepts",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/agent-id.test.ts")],
    root,
  ],
  [
    "A formatter is reused and follows the language",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/format.test.ts")],
    root,
  ],
  [
    "Indicators read both forms of a measure",
    process.execPath,
    ["--test", join(root, "tests/unit/indicators.test.mjs")],
    root,
  ],
  [
    "The thread follows the agent and can be let go",
    process.execPath,
    ["--conditions=browser", "--test", "--experimental-strip-types", join(root, "tests/unit/paste.test.ts")],
    root,
  ],
  [
    "Quick replies read the same in the window and in what leaves the chat",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/next-steps.test.ts")],
    root,
  ],
  [
    "The bar picks the row, and the exact command leads",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/suggestions.test.ts")],
    root,
  ],
  [
    "/btw goes to the side only with an agent that declares it, and «Pasar al hilo» sends nothing",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/side-question.test.ts")],
    root,
  ],
  [
    "`!` commands stay aligned in the box and run without the indent",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "scripts/terminal-indent.test.ts")],
    root,
  ],
  [
    "The at-sign menu suggests delegates by name without clashing with material",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/recipient-menu.test.ts")],
    root,
  ],
  [
    "A recipient is painted apart from the material and moves with it",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/recipients.test.ts")],
    root,
  ],
  [
    "Pasting an image attaches it and pasting text does not",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/clipboard.test.ts")],
    root,
  ],
  [
    "Task activity does not steal focus from whoever is typing",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/focus.test.ts")],
    root,
  ],
  [
    "⌘A outside a field selects the clicked block, not the window",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/select-all.test.ts")],
    root,
  ],
  [
    "A reopened turn keeps its order",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/turn-order.test.ts"), join(root, "tests/unit/history-refs.test.ts")],
    root,
  ],
  [
    "The reply says which model answered",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/turn-model.test.ts")],
    root,
  ],
  [
    "The context meter comes from what the agent publishes",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/context-window.test.ts")],
    root,
  ],
  [
    "Slash command output is painted with its command",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/command-output.test.ts")],
    root,
  ],
  [
    "What is typed into a `!` hides secrets",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/command-input.test.ts")],
    root,
  ],
  [
    "A late fragment of a message returns to its bubble",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/chat-delta.test.ts")],
    root,
  ],
  [
    "A turn with several subtasks and a message to one of them is not painted twice",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/chat-delegation-thread.test.ts")],
    root,
  ],
  [
    "A service that comes back is not painted on screen",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/invoke-retry.test.ts")],
    root,
  ],
  [
    "Saving the Telegram token waits for a saturated window",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/telegram-section.test.ts")],
    root,
  ],
  [
    "New task opens its draft with the inherited sources",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/new-task.test.ts")],
    root,
  ],
  [
    "Dragging a task moves it and does not open it",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/move-task.test.ts")],
    root,
  ],
  [
    "An archived task leaves the list and not its tree",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/archived-tasks.test.ts")],
    root,
  ],
  [
    "History keeps the order of its author groups",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/task-authors.test.ts")],
    root,
  ],
  [
    "The branch shows on the row that has the tree",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/task-branch.test.ts")],
    root,
  ],
  [
    "A task card colors its folder and claims only the confirmed PR",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/task-hover-card.test.ts")],
    root,
  ],
  [
    "The row shows the command, not how it was launched",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/step-command.test.ts")],
    root,
  ],
  [
    "A source is named by its provider, not by the AppData copy",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/source-origin.test.ts")],
    root,
  ],
  [
    "The chat background shrinks by quality and size steps down to 1.5 MB",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/shrink-image.test.ts")],
    root,
  ],
  [
    "In the browser a workspace logo and background are read and changed in the account",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/web-workspace-assets.test.ts")],
    root,
  ],
  [
    "In the browser the change log is read from the active account with the session",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/web-audit-log.test.ts")],
    root,
  ],
  [
    "Logo cropping keeps the chosen square",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/logo-crop.test.ts")],
    root,
  ],
  [
    "The chat paints no destination that executes",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/links.test.ts")],
    root,
  ],
  [
    "A draw.io view does not break the tag that holds it",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/drawio.test.ts")],
    root,
  ],
  [
    "Ctrl+click or ⌘+click on a chat link opens it outside without asking",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/link-click.test.ts")],
    root,
  ],
  [
    "The backend is painted in the window language",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/prose.test.ts")],
    root,
  ],
  [
    "The selector keeps the provider",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/models.test.ts")],
    root,
  ],
  [
    "A task changes CLI only when the engine, the machine and the idle session allow it, and the consent goes before the turn",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/provider-handover.test.ts")],
    root,
  ],
  [
    "Markdown is split without changing what is seen",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/markdown.test.ts")],
    root,
  ],
  [
    "What streaming computes in parts equals computing it at once",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/streaming-parity.test.ts")],
    root,
  ],
  [
    "Table columns are shared out by their text",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/markdown-table.test.ts")],
    root,
  ],
  [
    "Formulas are painted and money stays as text",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/markdown-math.test.ts")],
    root,
  ],
  [
    "The diff numbers lines where they are",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/diff.test.ts")],
    root,
  ],
  [
    "The diff marks the changed word and aligns both panes",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/diff-words.test.ts")],
    root,
  ],
  [
    "The permissions shortcut does not cycle what it cannot",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/modes.test.ts")],
    root,
  ],
  [
    "The tree does not hide what changed",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/tree.test.ts")],
    root,
  ],
  [
    "A tabular file reads as a table and not as text",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/csv.test.ts")],
    root,
  ],
  [
    "An image zooms within its limits",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/zoom.test.ts")],
    root,
  ],
  [
    "Each file carries its format's icon",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/icons.test.ts")],
    root,
  ],
  [
    "A cloud repository is painted as a repository",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/workdir-icon.test.ts")],
    root,
  ],
  [
    "A project has a stable color and a readable location",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/project-settings.test.ts")],
    root,
  ],
  [
    "A tab is not lost when closing another",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/tabs.test.ts")],
    root,
  ],
  [
    "Each task's files panel keeps its tabs",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/task-files.test.ts")],
    root,
  ],
  [
    "Search cards keep the match text and skip a day the message does not have",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/search-cards.test.ts")],
    root,
  ],
  [
    "The tab shortcut reads the physical key and does not clash with another",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/tab-shortcuts.test.ts")],
    root,
  ],
  [
    "The window grid does not go out of square",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/panels.test.ts")],
    root,
  ],
  [
    "History pages join without mixing different transcripts",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/push-history.test.ts")],
    root,
  ],
  [
    "Opening a long thread mounts its end and the rest arrives on scrolling up",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/thread-window.test.ts")],
    root,
  ],
  [
    "The open file hears about the turn",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/code-refresh.test.ts")],
    root,
  ],
  [
    "A read failure does not empty the code panel",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/last-good-trees.test.ts")],
    root,
  ],
  [
    "The task list recovers from a failure by itself",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/session-refresh.test.ts")],
    root,
  ],
  [
    "Storage refreshes without mixing workspaces",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/storage-refresh.test.ts")],
    root,
  ],
  [
    "Machines reads pressure, memory and version, and an older host stays at «Solo disco»",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/machine-usage.test.ts")],
    root,
  ],
  [
    "Settings opens old ids at their entry and tab",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/settings-entries.test.ts")],
    root,
  ],
  [
    "The Harness menu follows plan, role and available sources",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/admin-sections.test.ts")],
    root,
  ],
  [
    "A site's layer shows when due",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/sites.test.ts")],
    root,
  ],
  [
    "A provider failure says which one and what to do",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/turn-failure.test.ts")],
    root,
  ],
  [
    "A decided or in-flight permission is not painted as closed and a reread does not erase new gates",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/permission-gates.test.ts")],
    root,
  ],
  [
    "Delivery retry does not resend to the person",
    process.execPath,
    ["--test", join(root, "tests/unit/retry-delivery-resume.test.mjs")],
    root,
  ],
  [
    "Attachments leave the box on send and return on failure",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/draft-attachments.test.ts")],
    root,
  ],
  [
    "An image attached on this Mac travels as bytes to the task's machine",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/remote-attachments.test.ts")],
    root,
  ],
  [
    "The queue goes out in the task where it was written",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/queue.test.ts")],
    root,
  ],
  [
    "A live task says so without stopping",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/turn-status.test.ts")],
    root,
  ],
  [
    "Right-click does not offer to reload the window",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/context-menu.test.ts")],
    root,
  ],
  [
    "The rail keeps its agents on refresh",
    process.execPath,
    ["--conditions=browser", "--test", "--experimental-strip-types", join(root, "tests/unit/sidebar-agents.test.ts")],
    root,
  ],
  [
    "A website is painted as a website",
    process.execPath,
    ["--test", "--experimental-strip-types", join(root, "tests/unit/web-artifact.test.ts")],
    root,
  ],
  ["The front passes the linter", process.execPath, [join(root, "node_modules/@biomejs/biome/bin/biome"), "lint", "src", "scripts", "tests"], root],
  ["The front compiles", process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-b"], root],
  [
    "TypeScript tests typecheck",
    process.execPath,
    [join(root, "node_modules/typescript/bin/tsc"), "-p", join(root, "tests"), "--noEmit"],
    root,
  ],
  ["Bundles the front", process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build"], root],
  ["Initial load stays under its ceiling", process.execPath, [join(root, "tests/perf/bundle-size.mjs")], root],
  ["Front mounts", process.execPath, [join(root, "scripts/guards/mount-frontend.mjs")], root],
  ["Task notices mount", process.execPath, [join(root, "scripts/guards/mount-task-notices.mjs")], root],
  ["Agents mount in the rail and the composer", process.execPath, [join(root, "scripts/guards/mount-agents.mjs")], root],
  ["A task composer mounts with its queue and attachments", process.execPath, [join(root, "scripts/guards/mount-task-composer.mjs")], root],
  ["The rail mounts with git, groups and clone", process.execPath, [join(root, "scripts/guards/mount-sidebar.mjs")], root],
  ["Starting and following a turn mounts", process.execPath, [join(root, "scripts/guards/mount-turns.mjs")], root],
  ["Settings mounts", process.execPath, [join(root, "scripts/guards/mount-settings.mjs")], root],
  ["Workspaces, title bar and first run mount", process.execPath, [join(root, "scripts/guards/mount-workspaces.mjs")], root],
  ["Live questions and permissions mount", process.execPath, [join(root, "scripts/guards/mount-permissions.mjs")], root],
  ["Prose, diagrams and updates mount", process.execPath, [join(root, "scripts/guards/mount-content.mjs")], root],
  ["Spaces mount", process.execPath, [join(root, "scripts/guards/mount-spaces.mjs")], root],
  ["Bundles the browser entry", process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "web"], root],
  ["The phone version installs as an app and always loads the latest", process.execPath, ["--test", join(root, "tests/unit/web-phone-pwa.test.mjs")], root],
  ["In the browser the interface talks to the relay", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-transport.test.mjs")], root],
  ["In the browser the Danil session picks the computer and explains why it cannot enter", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-gate.test.mjs")], root],
  ["In the browser the app opens at once, with no installer or setup screen", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-setup.test.mjs")], root],
  ["In the browser a new version is offered without a forced reload", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-stale-chunk.test.mjs")], root],
  ["In the browser an off computer mounts without starting and wakes on being sent something", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-off.test.mjs")], root],
  ["In the browser what the relay saved shows with its time while the computer is off", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-cached.test.mjs")], root],
  ["In the browser one panel joins all computers and each command goes to its machine", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-machines.test.mjs")], root],
  ["In the browser storage follows its machine and does not wait for an off VM", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-machines-storage.test.mjs")], root],
  ["In the browser an off machine or another contract does not break the panel and each credential stays apart", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-machines-contracts.test.mjs")], root],
  ["In the browser account workspaces show with their machines asleep", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-account-workspaces.test.mjs")], root],
  ["In the browser account memory shows, edits and has history with the machines off", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-memory-account.test.mjs")], root],
  ["In the browser spaces come from the machine that keeps them even if another sleeps", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-spaces.test.mjs")], root],
  ["In the browser with everything off the page opens in under 2 s with each machine's saved data, and another contract does not break it", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-fleet.test.mjs")], root],
  ["In the browser chat images and visuals are read from the remote computer", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-chat-media.test.mjs")], root],
  ["In the browser carrying work between computers goes sealed in 512 KiB parts", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-carry.test.mjs")], root],
  ["In the browser cloning on the computer follows its progress, cancels and recovers on reload", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-project-clone.test.mjs")], root],
  ["In the browser adding a managed computer does not install and connects cloud accounts", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-onboarding.test.mjs")], root],
  ["Setup in progress lets a latecomer continue", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/setup-in-flight.test.mjs")], root],
  ["Setup does not open over a painted app and does not go blind", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/setup-repair.test.mjs")], root],
  ["The usage strip follows the active account when quota switches it", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/usage-active-account.test.mjs")], root],
  ["With an account sharing a credential, the reason it cannot add another shows", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/shared-credential-note.test.mjs")], root],
  ["Waiting for the previous version is a notice and stopping it is confirmed", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/launcher-previous.test.mjs")], root],
  ["Danil accounts sign in through the browser, add up and sign out", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/danil-account-panel.test.mjs")], root],
  ["First run and the sidebar footer offer the Danil account", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/danil-sign-in-entry.test.mjs")], root],
  ["First-run Google Drive reconnects after disconnecting", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/onboarding-drive-reconnect.test.mjs")], root],
  ["Google Drive with the official app installs, waits for the session and stops being used without uninstalling", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/onboarding-drive-desktop.test.mjs")], root],
  ["Each workspace picks its Danil account and the footer follows the open one", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/danil-workspace-account.test.mjs")], root],
  ["Workspace memory is written and edited like project memory", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/memory-workspace-scope.test.mjs")], root],
  ["The window shows account memory history and marks conflict copies", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/memory-history-window.test.mjs")], root],
  ["The Danil account talks to the engine through danil_connect_*", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/danil-account.test.ts")], root],
  ["Each workspace talks to its Danil account, and an older engine leaves the single account", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/danil-sessions.test.ts")], root],
  ["In the browser the approval page connects a computer to the account", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-connect.test.mjs")], root],
  ["An approval invalidates its identity without touching other slots", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/web-session.test.ts")], root],
  ["The alpha WorkOS session asks for a short token, renews it and ends without a fallback", process.execPath, ["--test", "--test-force-exit", "--experimental-strip-types", join(root, "tests/unit/web-workos-session.test.ts")], root],
  ["Broadcasts: the full panel, the Appv2 rules and what stays behind the switch", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/attention/test/broadcast-panel.test.ts")], root],
  ["app.danil.ai/terminus answers 308 to the same alfa path and never leaves that host", process.execPath, ["--test", join(root, "web-redirect/worker.test.mjs")], root],
  ["The alpha entry bounds explicit reads and writes, and leaves WorkOS sign-in in the Worker", process.execPath, ["--test", join(root, "alpha-entry/worker.test.mjs")], root],
  ["A workspace without a safe account shows data from none", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/workspace-account.test.ts")]],
  ["The directory groups what can be entered and the bar shows the pinned ones", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/workspace-directory.test.ts")]],
  ["The attention reader does not extract variable values or API connection paths", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/attention-service.test.ts")]],
  ["Inbox: effective permissions and queued replies without ambiguous retries", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/attention/test/inbox.test.ts"), join(root, "../../packages/attention/test/messaging.test.ts"), join(root, "tests/unit/inbox-drafts.test.ts")], root],
  ["Broadcasts: permissions by account and channel, templates and real transitions", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/attention/test/broadcasts.test.ts")], root],
  ["The alpha entry swaps the WorkOS session for a database token and denies on any failure", process.execPath, ["--test", join(root, "tests/unit/alpha-entry-session.test.mjs")], root],
  ["The alpha entry only lets through attention reads from its closed list", process.execPath, ["--test", join(root, "tests/unit/alpha-entry-service.test.mjs")], root],
  ["The auth return stays inside Terminus", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/web-auth-return.test.ts")], root],
  ["Web sign-up confirms the email and keeps the destination", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-auth.test.mjs")], root],
  ["In the browser the Danil account's person shows and changes their photo", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-account.test.mjs")], root],
  ["In the browser account computers are listed and renamed in place", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-account-computers.test.mjs")], root],
  ["In the browser the column joins workspaces of other Danil accounts and opens each with its own", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-other-accounts.test.mjs")], root],
  ["In the browser «Agregar cuenta» first offers accounts with a session, like Google", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-account-chooser.test.mjs")], root],
  ["In the browser each account key says which machines it is on, is removed with a notice and is changed sealed here", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-account-credentials.test.mjs")], root],
  ["In the browser secrets come by scope, an old machine says «no compatible» and a new one is sealed only for those with secrets_v1", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/web-secrets.test.mjs")], root],
  ["On desktop account keys go through the engine and the notice uploads only the chosen ones", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/desktop-account-credentials.test.mjs")], root],
  ["On desktop Secrets saves and deletes through the engine, without an account says «Solo en esta máquina» and an old engine turns off only that section", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/desktop-secrets.test.mjs")], root],
  ["The approval page and contract compatibility talk to the control plane", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/danil-connect-web.test.ts")], root],
  ["Account emails on the web: client, order and rejection texts", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/account-emails.test.ts")], root],
  ["With the pushed stream batches reach listeners and history is paged", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/push-stream.test.mjs"), join(root, "tests/unit/push-history.test.mjs")], root],
  ["Sending to another machine carries unpushed work, and bringing it back leaves it on a local branch", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/carry-window.test.mjs")], root],
  ["A task of an off machine opens and starts on being sent something", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/machine-task.test.mjs")], root],
  ["By folder, a folder on two machines is one group per machine and its «+» launches on its own", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/sidebar-folder-machines.test.mjs")], root],
  ["A task tree from another machine is read on that machine", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/machine-task-tree.test.mjs")], root],
  ["The fleet: the machine comes from the envelope, every wait has a cap and nobody answering is not an empty list", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/fleet/test/fleet.test.ts")], root],
  ["Danil Computers: session with contracts, token renewal, engine and tombstones", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/computers/test/computers.test.ts")], root],
  ["Danil Computers: account GitHub through the Worker, with its routes and codes", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/computers/test/github.test.ts")], root],
  ["On the web account GitHub is answered by the Worker, not a machine", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/web-github-account.test.ts")], root],
  ["With a Danil session the GitHub card is the account's; without it, the usual local one", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/github-account-settings.test.mjs")], root],
  ["Account credentials: the Worker client and TERMINUS-SECRET/1 sealing with the engine vectors", process.execPath, ["--test", "--experimental-strip-types", join(root, "../../packages/computers/test/credentials.test.ts"), join(root, "../../packages/computers/test/seal.test.ts")], root],
  ["With the Danil account this computer's work goes native and first; the others add their slice", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/machine-router.test.ts")], root],
  ["A task from another machine in an account space shows in that same space", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/spaces-remote-task.test.ts")], root],
  ["On the web everything is on other machines: saved data opens now, acting starts the VM and an off Mac says so", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/web-router.test.ts")], root],
  ["The web holds several Danil accounts: each with its session, no repeats, and the page opens the workspace owner", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/web-accounts.test.ts")], root],
  ["With the Danil account the desktop joins tasks from all its computers", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/desktop-account-machines.test.mjs")], root],
  ["With the Danil account the desktop follows its session and each computer", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/desktop-account-sessions.test.mjs")], root],
  ["With the Danil account the desktop sorts the rail and lists its computers", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/desktop-account-rail.test.mjs")], root],
  ["Shared machines show in the toolbar menu, with status and start, and are not task targets", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/shared-machines-menu.test.mjs")], root],
  ["The viewer waits for noVNC and frees each connection on close or retry", process.execPath, ["--test", "--experimental-strip-types", join(root, "tests/unit/screen-connection.test.ts"), join(root, "../../packages/computers/test/screen.test.ts")], root],
  ["Without the pushed stream the window polls as always", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/push-fallback.test.mjs")], root],
  ["Successful maintenance does not notify and dismissed failures do not repeat", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/activity-notice.test.mjs")], root],
  ["With tasks working, restart or quit waits for them or stops the ones it names", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/update-wait.test.mjs")], root],
  ["A reply with a visual does not vanish from chat even if the turn is not saved or the visual cannot be read", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/chat-turn-unsaved.test.mjs")], root],
  ["What is sent into the live turn goes out once, even on repeated presses or if the engine does not return the turn", process.execPath, ["--test", "--test-force-exit", join(root, "tests/unit/chat-steer-once.test.mjs")], root],
  ["Opening a long task stays under its ceiling", process.execPath, [join(root, "tests/perf/open-task-cost.mjs")], root],
  ["Rereading an open task does not remount its thread", process.execPath, [join(root, "tests/perf/reread-thread.mjs")], root],
  ["A long session leaves no memory behind", process.execPath, ["--expose-gc", join(root, "tests/perf/long-session.mjs")], root],
  ["A turn does not request every history again", process.execPath, [join(root, "tests/perf/task-history-calls.mjs")], root],
  ["A long reply stays under its per-delta ceiling", process.execPath, [join(root, "tests/perf/delta-cost.mjs")], root],
  ["The warm sidebar does not wait for the engine", process.execPath, [join(root, "tests/perf/cold-start-sidebar.mjs")], root],
  ["Every written class paints something", process.execPath, [join(root, "scripts/guards/missing-classes.mjs")], root],
  ["Every color inverts with the theme", process.execPath, [join(root, "scripts/guards/theme-inversion.mjs")], root],
  ...(SKIP_RUST ? [] : rustSteps.slice(1)),
];

const undocumented = undocumentedGuards();
if (undocumented.length) {
  console.error("Guard catalog out of date in docs/guards.md:");
  for (const guard of undocumented) console.error(`  ${guard}`);
  console.error("\nFix the rows of docs/guards.md before verifying.");
  process.exit(1);
}

{
  const scheduled = new Set(steps.flatMap(([, , args]) => args));
  const unscheduled = [...walkFiles(join(root, "tests/unit"))]
    .filter((path) => /\.test\.(ts|mjs)$/.test(path))
    .filter((path) => !scheduled.has(path))
    .map((path) => relative(root, path));
  if (unscheduled.length > 0) {
    console.error(
      `\n  Tests outside the chain: ${unscheduled.join(", ")}` +
        "\n  Add them to the step list of verify.mjs, where they belong.\n",
    );
    process.exit(1);
  }
}

const isVite = (step) => step[0].startsWith("Bundles ");
const REQUIRES_DIST = /scripts\/guards\/(?:mount-frontend|missing-classes|theme-inversion)\.mjs$/;
const isAlwaysQuick = ([, , args]) =>
  !rustSteps.some((step) => step[2] === args) &&
  args.some((arg) => /node_modules\/(?:@biomejs\/biome\/bin\/biome|typescript\/bin\/tsc)$|scripts\/icons\.mjs$|scripts\/guards\//.test(arg) && !REQUIRES_DIST.test(arg));

/** El plan de `--quick`: `reason` dice por qué corre todo; `plan` es el subconjunto de pasos cuando no. */
function quickScope() {
  const diff = changedFiles(root, BASE);
  if (diff.reason) return { reason: diff.reason };
  const groups = classify(diff.files);
  if (groups.full.length) return { reason: `touched ${groups.full.slice(0, 5).join(", ")}${groups.full.length > 5 ? "…" : ""}` };
  const reachOf = testReader(root);
  const rust = groups.rust.length > 0;
  const plan = new Set(steps.filter(isAlwaysQuick));
  const changed = [...groups.code, ...groups.tests];
  const reached = new Set();
  let build = false;
  for (const step of steps) {
    if (plan.has(step) || isVite(step) || rustSteps.includes(step) || step[2].some((arg) => REQUIRES_DIST.test(arg))) continue;
    const files = stepFiles(step[2]);
    if (!files.length) continue;
    const reach = reachOf(files);
    for (const file of reach.files) reached.add(file);
    if (touches(reach, changed) || (step === cliStep && rust)) {
      plan.add(step);
      build ||= reach.needsBuild;
    }
  }
  const orphan = groups.tests.find((file) => !reached.has(file.slice("apps/desktop/".length)));
  if (orphan) return { reason: `no test reaches ${orphan}` };
  if (build || (rust && !SKIP_RUST)) for (const step of steps.filter(isVite)) plan.add(step);
  if (rust) for (const step of rustSteps) plan.add(step);
  if (plan.has(cliStep)) plan.add(engineStep);
  return { plan, count: diff.files.length, mergeBase: diff.mergeBase.slice(0, 8) };
}

const outputOf = (e) => [e?.stdout, e?.stderr].map((s) => (s ?? "").toString()).join("").trimEnd();

const GIB = 1024 ** 3;
const STEP_TIMEOUT_MS = 15 * 60_000;
const CARGO_TIMEOUT_MS = 45 * 60_000;

/** Un paso por cada dos núcleos y por cada 2 GiB libres; con 1, la cadena corre en serie. En macOS `freemem` no cuenta la caché: vale la mitad del total. */
function budget() {
  const forced = Number(process.env.VERIFY_JOBS);
  if (Number.isSafeInteger(forced) && forced > 0) return forced;
  const memory = process.platform === "darwin" ? totalmem() / 2 : freemem();
  return Math.max(1, Math.min(Math.floor(availableParallelism() / 2), Math.floor(memory / (2 * GIB))));
}

const running = new Set();

function killGroup(child) {
  try {
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // El proceso pudo salir antes de la señal.
  }
}

function run(cmd, args, cwd, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    running.add(child);
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const finish = (status, signal, error) => {
      clearTimeout(timer);
      running.delete(child);
      resolve({ status, signal, timedOut, stdout, stderr: error ? `${stderr}\n${error.message}` : stderr });
    };
    child.on("error", (error) => finish(null, null, error));
    child.on("close", (status, signal) => finish(status, signal));
  });
}

/** Reparte huecos; quien pide más que el total espera a tenerlos todos. */
function slots(total) {
  let free = total;
  const waiting = [];
  const wake = () => {
    while (waiting.length && free >= waiting[0].weight) {
      const { weight, resolve } = waiting.shift();
      free -= weight;
      resolve();
    }
  };
  return {
    acquire: (weight) => new Promise((resolve) => { waiting.push({ weight, resolve }); wake(); }),
    release: (weight) => { free += weight; wake(); },
  };
}

/** Dos cadenas juntas saturan memoria y disco; el candado de un proceso muerto se limpia. */
async function takeLock() {
  const dir = join(tmpdir(), "terminus-verify.lock");
  const owner = join(dir, "pid");
  for (let warned = false; ; await sleep(2000)) {
    try {
      mkdirSync(dir);
      writeFileSync(owner, String(process.pid));
      return () => rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "EEXIST") return () => {};
    }
    let pid = 0;
    try {
      pid = Number(readFileSync(owner, "utf8"));
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "EPERM") pid = Number(pid);
      else if (pid || error?.code === "ESRCH") {
        rmSync(dir, { recursive: true, force: true });
        continue;
      }
    }
    if (!warned) console.log(`  Another chain is running on this machine (pid ${pid}); waiting for it to finish.`);
    warned = true;
  }
}

let failure = null;
const skipped = [];
const JOBS = budget();
const pool = slots(JOBS);

async function runStep(step, weight = 1) {
  const [name, cmd, args, cwd] = step;
  await pool.acquire(weight);
  try {
    if (failure) return;
    if (SKIP_RUST && name === cliStep[0]) {
      console.log(`  ${name.padEnd(50)}SKIPPED`);
      skipped.push([name, "--no-cargo: needs rustc and the pinned sidecar; it runs in the full chain and verify (rust).", true]);
      return;
    }
    const isCargo = cmd === rustBuild.command;
    const start = Date.now();
    const result = await run(cmd, args, cwd, isCargo && cwd === backend && args[0] !== "fmt" ? rustBuild.env : process.env, isCargo ? CARGO_TIMEOUT_MS : STEP_TIMEOUT_MS);
    if (result.status === 0) console.log(`  ${name.padEnd(50)}ok   ${((Date.now() - start) / 1000).toFixed(1)}s`);
    else if (result.status === SKIPPED_EXIT_CODE) {
      console.log(`  ${name.padEnd(50)}SKIPPED`);
      skipped.push([name, outputOf(result)]);
    } else if (!failure) {
      console.log(`  ${name.padEnd(50)}${result.timedOut ? "TIMEOUT" : "FAILED"}`);
      failure = { name, cmd, args, e: result };
      for (const child of running) killGroup(child);
    }
  } finally {
    pool.release(weight);
  }
}

const runAll = (list) => Promise.all(list.map((step) => runStep(step)));
async function runInOrder(list, weight) {
  for (const step of list) await runStep(step, weight);
}

const isCargoLane = (step) => rustSteps.includes(step) && step !== engineStep;
const isPerf = ([, , args]) => args.some((arg) => typeof arg === "string" && arg.includes("tests/perf/"));
const firstBuild = steps.findIndex(isVite);
const scope = QUICK ? quickScope() : {};
const omitted = scope.plan ? steps.filter((step) => !scope.plan.has(step)) : [];
const planned = (step) => !omitted.includes(step);
const beforeBuild = steps.slice(0, firstBuild).filter((step) => step !== engineStep && planned(step));
const afterBuild = steps.slice(firstBuild).filter((step) => !isVite(step) && !isCargoLane(step) && (!isPerf(step) || step[0].startsWith("Initial load")) && planned(step));
const measured = steps.slice(firstBuild).filter((step) => isPerf(step) && !afterBuild.includes(step) && planned(step));

const releaseLock = await takeLock();
const startedAt = Date.now();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    for (const child of running) killGroup(child);
    releaseLock();
    console.error(`\n  Chain cut by ${signal}: anything not marked ok was not checked.\n`);
    process.exit(1);
  });
}
console.log(`  Up to ${JOBS} steps at a time (VERIFY_JOBS changes it).`);
if (scope.reason) console.log(`  --quick runs the full chain: ${scope.reason}.`);
if (scope.plan) console.log(`  --quick against ${BASE} (${scope.mergeBase}): ${scope.count} files changed, ${steps.length - omitted.length} of ${steps.length} steps. This is NOT a full verification.`);
console.log("");

if (steps.includes(engineStep) && planned(engineStep)) await runStep(engineStep);
if (!failure) await runAll(beforeBuild);
if (!failure) await runInOrder(steps.filter((step) => isVite(step) && planned(step)), JOBS);
// `generate_context!` lee `dist/`: cargo antes de vite falla en un checkout limpio.
const cargoLane = SKIP_RUST || failure ? Promise.resolve() : runInOrder(steps.filter((step) => isCargoLane(step) && planned(step)), Math.ceil(JOBS / 2));
if (!failure) await runAll(afterBuild);
await cargoLane;
// Miden un techo de gasto; con otros pasos al lado medirían esa carga.
if (!failure) await runInOrder(measured, JOBS);
releaseLock();

if (failure) {
  const { name, cmd, args, e } = failure;
  console.error(`\n  Failed: ${name}`);
  console.error(`      ${[cmd, ...args].join(" ")}`);
  if (e?.signal) console.error(`      ended by signal ${e.signal}`);
  if (e?.timedOut) console.error("      passed its deadline and was killed with its children");
  console.error("");
  for (const [stream, output] of [["stdout", e?.stdout], ["stderr", e?.stderr]]) {
    const text = (output ?? "").toString().trimEnd();
    if (!text) continue;
    const lines = text.split("\n");
    console.error(`      ${stream}:`);
    for (const line of lines.slice(-40)) console.error(`      ${line}`);
    if (lines.length > 40) console.error(`\n  (${lines.length - 40} earlier lines of ${stream} — run that command alone again)`);
  }
  console.error("");
  process.exit(1);
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);

if (skipped.length) {
  const one = skipped.length === 1;
  const skippedCount = `${skipped.length} of ${steps.length - omitted.length} steps did NOT run`;
  console.log(`\n  Ran on ${PLATFORM}, ${seconds}s — and ${skippedCount}: this is NOT a verification.`);
  console.log(`  What ${one ? "that guard catches" : "those guards catch"} stays unchecked:`);
  for (const [name, reason] of skipped) {
    console.log(`\n    ${name}`);
    for (const line of reason.split("\n")) console.log(`      ${line}`);
  }
  console.log("");
} else if (!omitted.length) {
  console.log(`\n  Verified on ${PLATFORM}${SKIP_RUST ? " (chain without Rust)" : ""}, ${seconds}s.`);
}
if (omitted.length) {
  console.log(`\n  --quick on ${PLATFORM}, ${seconds}s: this is NOT a full verification; run \`pnpm verify\` before merging.`);
  console.log(`  ${omitted.length} steps skipped:`);
  for (const [name] of omitted) console.log(`    ${name}`);
  console.log("");
}
if (SKIP_RUST) {
  console.log("  Not checked in this run: cargo fmt, check, clippy and test.");
  console.log("    The window has permission for what it asks — needs the Rust build.\n");
} else {
  console.log(`  ${OTHER_PLATFORMS} NOT checked — whoever reviews from there builds it.\n`);
}

if (skipped.some(([, , expected]) => !expected) && process.env.CI) process.exit(1);
