# Browser accounts

The web uses the platform session and lists the workspaces authorized by that
session. It selects a workspace with `POST /v1/workspaces/select`, CSRF and an
idempotency key. Browser token slots and the legacy account chooser are retired.
See [the browser build](development.md#the-browser-build).
