# Artifact preview read ordering

This fixture mounts the production `ArtifactViewer` with controlled `preview_file`
responses. It checks stale success, stale failure and switching task scope while
retaining the same path, plus a refreshed task lookup with an unchanged machine
and an actual machine change. It does not prove authentication or engine transport.

From `apps/desktop`:

```sh
pnpm exec vite build --config tests/helpers/artifact-probe/vite.config.ts
python3 -m http.server 4310 --directory dist-artifact-probe
# In another terminal, with Python Playwright and Chromium installed:
python3 tests/helpers/artifact-probe/check.py --url http://localhost:4310
```

Before the fix, resolving B then A replaces B with A. After the fix, the viewer
keeps B. A stale failure likewise cannot hide the current document, and changing
the task clears the previous document while reading the new scope.
