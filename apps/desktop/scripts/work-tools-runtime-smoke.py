#!/usr/bin/env python3
"""Ejecuta el motor y las herramientas del paquete con datos desechables y sin Node.

Necesita un motor que lea el manifiesto schema 2 (árbol preparado). Con --app en
macOS, comprueba al final que la firma estricta de la app sigue intacta.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import sys
import tempfile
import time
import uuid


def tree_tool(directory, manifest, id):
    entry = next(e for e in manifest["entries"] if e["id"] == id)
    return directory / manifest["tree"] / entry["path"] / entry["executable"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", type=Path, required=True)
    parser.add_argument("--resources", type=Path, required=True)
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--clone", action="store_true")
    parser.add_argument("--app", type=Path, help="macOS: the .app whose strict signature must survive the run")
    args = parser.parse_args()
    engine, resources = args.engine.resolve(strict=True), args.resources.resolve(strict=True)
    spec = importlib.util.spec_from_file_location("smoke", Path(__file__).with_name("work-tools-smoke.py"))
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    with tempfile.TemporaryDirectory(prefix="terminus-package-smoke-") as temporary:
        lab = Path(temporary)
        home, data = lab / "home", lab / "data"
        home.mkdir()
        bare = smoke.bare_path(lab)
        env = {key: os.environ[key] for key in ("SystemRoot", "COMSPEC", "PATHEXT") if key in os.environ}
        env.update(HOME=str(home), USERPROFILE=str(home), TMP=str(lab), TEMP=str(lab), TMPDIR=str(lab), PATH=bare,
                   SHELL="/bin/sh",
                   XDG_CONFIG_HOME=str(home / "config"), XDG_DATA_HOME=str(home / "share"),
                   HARNESS_IGNORE_SYSTEM_GIT="1", HARNESS_IGNORE_SYSTEM_AGENTS="1", SELDON_PROJECTS_DIR=str(lab / "projects"))
        log = (lab / "engine.log").open("wb")
        process = subprocess.Popen([str(engine), "--data-dir", str(data), "--resource-dir", str(resources),
                                    "--identity", "ai.danil.seldon.dev"], env=env, stdout=log, stderr=log)
        try:
            endpoint = None
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError((lab / "engine.log").read_text(errors="replace")[-6000:])
                path = data / "seldon-endpoint.json"
                if path.exists():
                    endpoint = json.loads(path.read_text())
                    if endpoint["pid"] == process.pid:
                        break
                time.sleep(.1)
            if not endpoint or endpoint["pid"] != process.pid:
                raise RuntimeError("Packaged engine did not start")

            def invoke(command, arguments=None, workspace=None):
                key = str(uuid.uuid4())
                timeout = 900 if command == "install_tool" and (arguments or {}).get("tool") == "browser-navigation" else 180
                deadline = time.monotonic() + max(600, timeout)
                while time.monotonic() < deadline:
                    request = {"version": 1, "token": Path(endpoint["token_file"]).read_text(),
                               "command": "service invoke", "args": {"command": command, "arguments": arguments or {}},
                               "workspace": workspace, "folder": None, "request_id": key}
                    address, port = endpoint["address"].rsplit(":", 1)
                    with socket.create_connection((address, int(port)), timeout=timeout) as connection:
                        connection.sendall(json.dumps(request).encode() + b"\n")
                        reply = json.loads(connection.makefile("rb").readline(16 * 1024 * 1024))
                    if reply.get("error"):
                        raise RuntimeError(reply)
                    result = reply["result"]
                    if result.get("pending"):
                        time.sleep(.1)
                        continue
                    if result.get("error"):
                        raise RuntimeError(result)
                    return result.get("value")
                raise TimeoutError(command)

            target = smoke.native_target()
            directory = resources / "work-tools" / target
            manifest = smoke.tools.load_manifest(directory, target)
            workspace = invoke("add_workspace", {"name": "Package smoke"})["id"]
            report = invoke("check_environment", {"force": True}, workspace)
            if not report["ready"] or {"node", "npm", "pnpm", "bun"}.intersection(report["essential"]):
                raise RuntimeError("Packaged tools did not prepare independently of Node/npm")
            invoke("install_tool", {"tool": "bundled-work-tools"}, workspace)
            store = data / "entorno/work-tools"
            check = json.loads((store / "state/check.json").read_text())
            if not check["ok"] or check["inventory_sha256"] != manifest["inventory_sha256"] or check["failures"]:
                raise RuntimeError(f"The engine's health check did not pass on this tree: {check}")
            if (store / "active.json").exists() or (store / "versions").exists():
                raise RuntimeError("With a prepared tree the engine must not extract a copy")
            plugins = {item["id"]: item for item in invoke("list_integrations", {}, workspace)["plugins"]}
            if not plugins["computer-use"]["installed"] or plugins["computer-use"]["enabled"]:
                raise RuntimeError("Cua must be installed and initially inactive")
            if plugins.get("drawio", {}).get("installed"):
                raise RuntimeError("draw.io is a plugin now; a fresh install must not have it")
            (lab / "tools").mkdir()
            tools = smoke.exercise(directory, target, lab / "tools", bare)
            if (store / "browser-navigation/active.json").exists():
                raise RuntimeError("Core preparation must not activate Chrome")
            if args.clone:
                operation = str(uuid.uuid4())
                (lab / "clones").mkdir()
                invoke("start_project_clone", {"url": "https://github.com/octocat/Hello-World.git", "name": "Public clone",
                       "directory": str(lab / "clones"), "operation": operation, "workspace": workspace}, workspace)
                deadline = time.monotonic() + 120
                cloned = None
                while time.monotonic() < deadline:
                    cloned = invoke("project_clone_status", {"operation": operation}, workspace)
                    if cloned and cloned.get("done"):
                        break
                    time.sleep(.2)
                if not cloned or not cloned.get("project") or cloned.get("error"):
                    raise RuntimeError(f"Packaged Git could not clone over HTTPS: {cloned}")
            if args.browser:
                print(json.dumps({"phase": "activate sandboxed browser", "architecture": platform.machine()}), flush=True)
                invoke("install_tool", {"tool": "browser-navigation"}, workspace)
                pin = json.loads((directory / "browser-navigation.json").read_text())["entry"]["executable"]
                chrome = next((store / "browser-navigation").glob(f"versions/*/{pin}"), None)
                if chrome is None:
                    raise RuntimeError("The activated Chrome is not where its pin says")
                page = lab / "page.html"
                page.write_text("<title>Terminus smoke</title><p>ok</p>")
                browser = tree_tool(directory, manifest, "agent-browser")
                browser_env = dict(env, AGENT_BROWSER_EXECUTABLE_PATH=str(chrome), AGENT_BROWSER_SOCKET_DIR=str(lab / "ab"))
                try:
                    subprocess.run([str(browser), "open", page.as_uri()], env=browser_env, check=True, timeout=120)
                    title = subprocess.run([str(browser), "get", "title"], env=browser_env, check=True, timeout=60,
                                           capture_output=True, text=True).stdout
                finally:
                    subprocess.run([str(browser), "close"], env=browser_env, timeout=60)
                if "Terminus smoke" not in title:
                    raise RuntimeError(f"agent-browser did not open the page: {title!r}")
            if smoke.tools.verify_output(directory, target)["inventory_sha256"] != manifest["inventory_sha256"]:
                raise RuntimeError("The tree changed while the engine used it")
            if args.app and platform.system() == "Darwin":
                subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose=2", str(args.app)],
                               check=True, timeout=300)
            print(json.dumps({"packaged_engine": str(engine), "tools": tools, "health": "check.json ok",
                              "cua": "installed, inactive", "drawio": "not installed (plugin)",
                              "app_signature": "strict after use" if args.app else "not requested",
                              "public_clone": "passed" if args.clone else "not requested",
                              "browser": "activated; agent-browser opened a page" if args.browser else "not activated"}))
        except Exception:
            log.flush()
            print((lab / "engine.log").read_text(errors="replace")[-6000:], file=sys.stderr)
            raise
        finally:
            process.terminate()
            try:
                process.wait(20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            log.close()


if __name__ == "__main__":
    main()
