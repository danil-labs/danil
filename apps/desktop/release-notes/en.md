Danil 0.3.0 brings the engine with provider handover and the Danil name across the app. It is a pre-release: it does not replace the stable version until it is promoted.

- **The app is called Danil.** The installer, the folder and the downloadable files become «Danil». A 0.2.x copy installed as Terminus updates in place and retires its previous entry.
- **Provider handover.** A normal task changes CLI (Claude, Codex or OpenCode) without losing the conversation: the new turn receives the context, and going back to the original CLI resumes its session with only what happened while it was away.
- **The engine decides who may change.** Adopted tasks, subagents, tasks with a handler and tasks with a live turn are refused. The budget is computed from the destination model's window; when it does not fit, the turn says so instead of trimming the conversation.
- **machines.danil.ai.** It is the default Danil Machines host; computers.danil.ai keeps answering.
- **A single sign-in.** The window opens the browser once and connects the engine with that same approval. Signing out closes both.
- **Danil Machines.** It is the visible name of the machines and the CLI group (`danil machines`, `dn machines`); `computers` stays as a hidden alias.
- **Usage for Harness.** The engine reports each turn's usage to Danil Machines, which stores it for the Harness panel.

The engine and its resources are pinned by version and SHA-256. This pre-release does not change the stable download link or the automatic update of installed copies: it is installed from its GitHub page.
