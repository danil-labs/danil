#!/usr/bin/env python3
"""Prepara y verifica los mismos recursos en las tres distribuciones de escritorio."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("work_tools", ROOT / "scripts/work-tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


def targets():
    return {"Darwin": ["aarch64-apple-darwin", "x86_64-apple-darwin"],
            "Windows": ["x86_64-pc-windows-msvc"],
            "Linux": ["x86_64-unknown-linux-gnu"]}[platform.system()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "verify"])
    parser.add_argument("--directory", type=Path, required=True,
                        help="prepare: staging root; verify: the packaged work-tools directory")
    args = parser.parse_args()
    if args.command == "prepare":
        config = args.directory / "tauri.work-tools.json"
        command = [sys.executable, str(ROOT / "scripts/work-tools.py"), "prepare", "--download",
                   "--max-download-bytes", str(2 * 1024 ** 3), "--output", str(args.directory / "work-tools"),
                   "--tauri-config", str(config)]
        for target in targets():
            command += ["--target", target]
        subprocess.run(command, check=True)
        if os.environ.get("GITHUB_ENV"):
            environment = {"WORK_TOOLS_CONFIG": str(config.resolve())}
            if platform.system() == "Linux":
                # El árbol va en usr/share, fuera de linuxdeploy; esto lo protege si cambia.
                environment.update(NO_STRIP="1", PATCHELF=str(ROOT / "scripts/work-tools-patchelf.py"),
                    TERMINUS_REAL_PATCHELF=shutil.which("patchelf"),
                    TERMINUS_WORK_TOOLS_ROOT=str(ROOT / "src-tauri/target/release/bundle/appimage/Danil.AppDir/usr/share/Danil/work-tools"))
            with open(os.environ["GITHUB_ENV"], "a") as stream:
                for key, value in environment.items():
                    stream.write(f"{key}={value}\n")
    else:
        reports = []
        for target in targets():
            directory = args.directory / target
            if platform.system() == "Darwin":
                native_spec = importlib.util.spec_from_file_location("work_tools_macos", ROOT / "scripts/work-tools-macos.py")
                native = importlib.util.module_from_spec(native_spec)
                native_spec.loader.exec_module(native)
                reports.append(native.verify_signed(directory, target, os.environ.get("APPLE_TEAM_ID")))
            else:
                reports.append(tools.verify_output(directory, target))
        if platform.system() == "Linux":
            reports.append(tools.verify_resources_inventory(args.directory.parent))
        print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
