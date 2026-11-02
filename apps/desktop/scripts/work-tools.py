#!/usr/bin/env python3
"""Build the prepared work-tools tree (schema 2) for desktop and headless packages.

Examples (from apps/desktop):
  python3 scripts/work-tools.py plan --target x86_64-unknown-linux-gnu
  python3 scripts/work-tools.py prepare --target x86_64-unknown-linux-gnu --cache /cache --download
  python3 scripts/work-tools.py verify --target x86_64-unknown-linux-gnu

The checked-in pins live in resources/work-tools/<target>/pins.json. prepare
writes <output>/<target>/ (default build/work-tools): manifest.json (schema 2),
inventory.json, browser-navigation.json, licenses/ and the <tree>/ every tool
runs from in place. Downloaded archives stay in <output>/.payloads/<target>/
and never ship. --tauri-config writes a Tauri config overlay only after every
target verifies; on Linux it also adds resources-inventory.json, the inventory
of every resource the AppImage copies (all under usr/share/Danil). Chrome is metadata only, never staged.
"""

import argparse
import contextlib
import csv
import email
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "resources" / "work-tools"
LANGUAGES = ROOT / "plugins" / "languages"
OUTPUT = ROOT / "build" / "work-tools"
REQUIRED = {"git", "python", "uv", "ripgrep", "agent-browser", "computer-use"}
IMPORTS = ["openpyxl", "docx", "pptx", "pypdf", "pdfplumber", "PIL", "reportlab"]
PLATFORMS = {"x86_64-unknown-linux-gnu": "x86_64-manylinux_2_28", "aarch64-apple-darwin": "aarch64-apple-darwin",
             "x86_64-apple-darwin": "x86_64-apple-darwin", "x86_64-pc-windows-msvc": "x86_64-pc-windows-msvc"}
# NSIS installs per user in %LOCALAPPDATA%\Terminus; the guard assumes a long profile name.
WINDOWS_PREFIX = "C:\\Users\\" + "u" * 32 + "\\AppData\\Local\\Terminus\\work-tools\\x86_64-pc-windows-msvc\\" + "0" * 12 + "\\"
WINDOWS_MAX_PATH = 259
EXTERNALLY_MANAGED = """[externally-managed]
Error=This Python is part of Terminus and is read-only.
 Install extra packages in a virtual environment (uv venv) or with uv tool.
"""


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def relative(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError(f"Unsafe relative path: {value!r}")
    path = PurePosixPath(value)
    if not path.parts or path.is_absolute() or ".." in path.parts or any(ord(c) < 32 for c in value):
        raise ValueError(f"Unsafe relative path: {value!r}")
    return path


def child(root, value):
    path = root.joinpath(*relative(value).parts)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes root: {value}")
    return path


def windows(target):
    return target.endswith("windows-msvc")


def load_pins(directory, target):
    data = json.loads((directory / "pins.json").read_text())
    if data["schema"] != 1 or data["target"] != target:
        raise ValueError("Pins schema/target mismatch")
    entries = data["entries"]
    if {e["id"] for e in entries} != REQUIRED or len(entries) != len(REQUIRED):
        raise ValueError("Base must contain exactly the six authorized tools")
    relative(data["documents"]["requirements"])
    if not re.fullmatch(r"[0-9a-f]{64}", data["documents"]["requirements_sha256"]):
        raise ValueError("Expected a pinned requirements SHA-256")
    for item in entries + data["documents"]["wheels"]:
        relative(item["archive"])
        if not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
            raise ValueError("Expected a pinned SHA-256")
        if not item["url"].startswith("https://") or not item["license"]:
            raise ValueError("Expected HTTPS provenance and license")
        if item.get("download_sha256") and not re.fullmatch(r"[0-9a-f]{64}", item["download_sha256"]):
            raise ValueError("Expected a pinned native source SHA-256")
    for item in entries:
        if item["format"] not in {"tar.gz", "zip", "raw"}:
            raise ValueError("Unsupported payload format")
        if type(item.get("strip_components", 0)) is not int or item.get("strip_components", 0) < 0:
            raise ValueError("Invalid strip_components")
        if item["executable"] is not None:
            relative(item["executable"])
    return data


def check_link(name, link, hard=False):
    if not link or link.startswith(("/", "\\")) or "\\" in link or ":" in link:
        raise ValueError(f"Unsafe archive link: {name} -> {link}")
    parts = [] if hard else list(PurePosixPath(name).parent.parts)
    for part in PurePosixPath(link).parts:
        if part == "..":
            if not parts:
                raise ValueError(f"Archive link escapes root: {name}")
            parts.pop()
        elif part != ".":
            parts.append(part)


def inspect_archive(path, item):
    if item["format"] == "raw":
        return path.stat().st_size
    strip = item.get("strip_components", 0)
    executable = item["executable"]
    found = executable is None
    size = 0
    with contextlib.ExitStack() as stack:
        if item["format"] == "zip":
            archive = stack.enter_context(zipfile.ZipFile(path))
            members = [(m.filename, m.file_size, m.is_dir(), m) for m in archive.infolist()]
        else:
            archive = stack.enter_context(tarfile.open(path, "r:gz"))
            members = [(m.name, m.size, m.isdir(), m) for m in archive.getmembers()]
        for name, length, is_dir, member in members:
            if is_dir and name in {".", "./"}:
                continue
            parts = relative(name).parts
            if item["format"] == "zip":
                if stat.S_ISLNK(member.external_attr >> 16):
                    check_link(name, archive.read(member).decode("utf-8"))
            elif member.issym() or member.islnk():
                check_link(name, member.linkname, member.islnk())
            elif not member.isfile() and not is_dir:
                raise ValueError(f"Unsupported archive member: {name}")
            if not is_dir:
                size += length
                if len(parts) > strip and "/".join(parts[strip:]) == executable:
                    found = True
        if not found:
            raise ValueError(f"Executable {executable} missing in {path.name}")
    return size


def verify_cua(root, target):
    if "apple-darwin" not in target:
        return "not-applicable"
    if platform.system() != "Darwin":
        raise ValueError("Cua macOS signature verification requires a macOS packaging runner")
    apps = [root / "CuaDriver.app"]
    if not apps[0].is_dir():
        raise ValueError("Expected one intact CuaDriver.app")
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose=2", str(apps[0])],
                   check=True, timeout=60)
    return "codesign-deep-strict"


# Lo que Cua usa al correr, igual que KEEP en environment/computer_use.rs del motor;
# el resto del archivo es su SDK para embeberlo.
CUA_KEEP = {
    "apple-darwin": ["CuaDriver.app", "LICENSE", "THIRD_PARTY_NOTICES.md"],
    "windows-msvc": ["cua-driver.exe", "cua-driver-uia.exe", "cua-cursor-theme.exe", "LICENSE", "THIRD_PARTY_NOTICES.md"],
    "linux-gnu": ["cua-driver", "cua-cursor-theme", "wayland-helper", "LICENSE", "THIRD_PARTY_NOTICES.md"],
}


def keep_cua(root, target):
    """Aplana la única carpeta del archivo de Cua y deja solo lo que el driver usa."""
    keep = next(names for suffix, names in CUA_KEEP.items() if target.endswith(suffix))
    inner = [p for p in root.iterdir()]
    if len(inner) != 1 or not inner[0].is_dir() or inner[0].is_symlink():
        raise ValueError("Expected one top-level Cua folder")
    for name in keep:
        if (inner[0] / name).exists() or (inner[0] / name).is_symlink():
            (inner[0] / name).rename(root / name)
    shutil.rmtree(inner[0])
    binary = "CuaDriver.app/Contents/MacOS/cua-driver" if "apple-darwin" in target else (
        "cua-driver.exe" if windows(target) else "cua-driver")
    if not (root / binary).is_file():
        raise ValueError(f"Cua archive lacks {binary}")


def obtain(item, destination, caches, download, budget):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if digest(destination) != item["sha256"]:
            raise ValueError(f"Existing payload checksum mismatch: {destination.name}")
        return
    if item.get("download_sha256"):
        with tempfile.TemporaryDirectory(prefix=".work-tools-native-", dir=destination.parent) as temporary:
            original = Path(temporary) / Path(item["url"]).name
            obtain({**item, "archive": original.name, "sha256": item["download_sha256"],
                    "download_sha256": None}, original, caches, download, budget)
            envelope = Path(temporary) / "envelope.zip"
            with zipfile.ZipFile(envelope, "w", compression=zipfile.ZIP_STORED) as archive:
                info = zipfile.ZipInfo(item["executable"], date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o755) << 16
                archive.writestr(info, original.read_bytes())
            if digest(envelope) != item["sha256"]:
                raise ValueError("Native payload envelope checksum mismatch")
            os.replace(envelope, destination)
        return
    name = Path(item["archive"]).name
    candidates = [cache / name for cache in caches]
    candidates += [cache / item["archive"] for cache in caches]
    candidates += [cache / item["sha256"] for cache in caches]
    source = next((p for p in candidates if p.is_file() and digest(p) == item["sha256"]), None)
    if source is None and not download:
        raise ValueError(f"Not cached: {name}; use --download explicitly")
    fd, temporary = tempfile.mkstemp(prefix=".payload-", dir=destination.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            if source:
                with source.open("rb") as inp:
                    shutil.copyfileobj(inp, out)
            else:
                request = urllib.request.Request(item["url"], headers={"User-Agent": "Terminus-work-tools/1"})
                with urllib.request.urlopen(request, timeout=60) as inp:
                    if not inp.url.startswith("https://"):
                        raise ValueError("Refusing insecure download redirect")
                    while chunk := inp.read(1024 * 1024):
                        budget[0] -= len(chunk)
                        if budget[0] < 0:
                            raise ValueError("Download byte budget exceeded")
                        out.write(chunk)
        if digest(Path(temporary)) != item["sha256"]:
            raise ValueError(f"Download checksum mismatch: {name}")
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)


def verify_wheels(store, source, pins):
    docs = pins["documents"]
    requirements_path = child(source, docs["requirements"])
    if digest(requirements_path) != docs["requirements_sha256"]:
        raise ValueError("Requirements checksum mismatch")
    expected = "".join(f'{w["name"]}=={w["version"]} --hash=sha256:{w["sha256"]}\n' for w in docs["wheels"])
    if requirements_path.read_text() != expected:
        raise ValueError("Requirements must pin every wheel and hash exactly")
    for wheel in docs["wheels"]:
        path = child(store, wheel["archive"])
        if digest(path) != wheel["sha256"]:
            raise ValueError(f"Wheel checksum mismatch: {path.name}")
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                relative(name)
            metadata = [n for n in archive.namelist() if n.endswith(".dist-info/METADATA")]
            if len(metadata) != 1:
                raise ValueError("Expected wheel metadata")
            info = email.message_from_bytes(archive.read(metadata[0]))
            normalize = lambda name: re.sub(r"[-_.]+", "-", name).lower()
            if normalize(info["Name"]) != normalize(wheel["name"]) or info["Version"] != wheel["version"]:
                raise ValueError("Wheel identity mismatch")


def extract(path, item, destination):
    """Extract one pinned archive into destination, dropping strip_components."""
    strip = item.get("strip_components", 0)
    destination.mkdir(parents=True)

    def place(name):
        parts = relative(name).parts
        return None if len(parts) <= strip else child(destination, "/".join(parts[strip:]))

    if item["format"] == "raw":
        target = child(destination, item["executable"])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        target.chmod(0o755)
        return
    if item["format"] == "zip":
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                target = place(member.filename)
                if target is None:
                    continue
                mode = member.external_attr >> 16
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if stat.S_ISLNK(mode):
                    link = archive.read(member).decode("utf-8")
                    check_link(member.filename, link)
                    target.symlink_to(link)
                    continue
                with archive.open(member) as inp, target.open("wb") as out:
                    shutil.copyfileobj(inp, out)
                target.chmod((mode & 0o777) or 0o644)
        return
    with tarfile.open(path, "r:gz") as archive:
        links = []
        for member in archive.getmembers():
            if member.isdir() and member.name in {".", "./"}:
                continue
            target = place(member.name)
            if target is None:
                continue
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.issym():
                check_link(member.name, member.linkname)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(member.linkname)
            elif member.islnk():
                links.append((member, target))
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as inp, target.open("wb") as out:
                    shutil.copyfileobj(inp, out)
                target.chmod(member.mode & 0o777)
            else:
                raise ValueError(f"Unsupported archive member: {member.name}")
        # The inventory has no hard links: each one becomes its own copy.
        for member, target in links:
            check_link(member.name, member.linkname, hard=True)
            original = place(member.linkname)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, target)
            target.chmod(member.mode & 0o777)


def stdlib(python, target):
    if windows(target):
        return python / "Lib"
    found = [p for p in (python / "lib").glob("python3.*") if p.is_dir()]
    if len(found) != 1:
        raise ValueError("Expected one Python stdlib directory")
    return found[0]


def record_without(dist_info, removed):
    record = dist_info / "RECORD"
    rows = [row for row in csv.reader(io.StringIO(record.read_text())) if row and row[0] not in removed]
    stream = io.StringIO()
    csv.writer(stream, lineterminator="\n").writerows(rows)
    record.write_text(stream.getvalue())


def runs(command):
    try:
        return subprocess.run([str(c) for c in command], capture_output=True, timeout=60).returncode == 0
    except OSError:
        return False


def python_runs(executable):
    return runs([executable, "-I", "-c", "import sys"])


def install_documents(tree, pins, store, source, target, compiler):
    """Install the pinned wheels into the bundled Python and seal it read-only."""
    python = tree / "python"
    lib = stdlib(python, target)
    site = lib / "site-packages"
    if not site.is_dir():
        raise ValueError("Bundled Python has no site-packages")
    uv = next(p for p in [tree / "uv" / "uv", tree / "uv" / "uv.exe"] if p.exists())
    host_uv = uv if runs([uv, "--version"]) else shutil.which("uv")
    if not host_uv:
        raise ValueError("Need the pinned uv (or a host uv) to install the document wheels")
    env = dict(os.environ)
    if target == "x86_64-apple-darwin":
        env["MACOSX_DEPLOYMENT_TARGET"] = "10.15"
    elif target == "aarch64-apple-darwin":
        env["MACOSX_DEPLOYMENT_TARGET"] = "11.0"
    with tempfile.TemporaryDirectory(prefix="terminus-uv-cache-") as cache:
        subprocess.run([str(host_uv), "pip", "install", "--offline", "--no-index", "--only-binary", ":all:",
                        "--require-hashes", "--no-deps", "--quiet", "--link-mode", "copy", "--no-config", "--cache-dir", cache,
                        "--target", str(site), "--python-platform", PLATFORMS[target],
                        "--python-version", pins["documents"]["python"],
                        "--find-links", str(store / "documents" / "wheels"),
                        "-r", str(child(source, pins["documents"]["requirements"]))],
                       check=True, timeout=600, env=env, stdout=subprocess.DEVNULL)
    # --target leaves scripts with the build host's shebangs and uv's own files: none are needed.
    for name in [".lock", "bin", "share"]:
        path = site / name
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)
    # The packages' own test suites are not part of the environment: about 28 MB and the longest paths.
    for tests in sorted(site.glob("*/**/tests")):
        if tests.is_dir() and not tests.is_symlink():
            shutil.rmtree(tests)
    for dist_info in site.glob("*.dist-info"):
        (dist_info / "uv_cache.json").unlink(missing_ok=True)
        rows = [line.split(",")[0] for line in (dist_info / "RECORD").read_text().splitlines()]
        record_without(dist_info, {row for row in rows if row.startswith(("bin/", "share/", "../"))
                                   or row.endswith("uv_cache.json") or "tests" in PurePosixPath(row).parts[1:]})
    for cache in list(python.rglob("__pycache__")):
        shutil.rmtree(cache)
    subprocess.run([str(compiler), "-I", "-m", "compileall", "-q", "-f", "-j", "0", "--invalidation-mode",
                    "unchecked-hash", "-s", str(python), "-p", "", "-x", r"[/\\](lib2to3|test|idle_test)[/\\]",
                    str(lib)], check=True, timeout=1200, stdout=subprocess.DEVNULL)
    (lib / "EXTERNALLY-MANAGED").write_text(EXTERNALLY_MANAGED)
    if windows(target):
        shutil.copyfile(python / "python.exe", python / "python3.exe")
    elif not (python / "bin" / "python").exists():
        (python / "bin" / "python").symlink_to("python3")
    return [{"name": w["name"], "version": w["version"]} for w in pins["documents"]["wheels"]]


def normalize_modes(tree):
    """Executables 0755, everything else 0644: the inventory must not depend on archives or umask."""
    for current, directories, names in os.walk(tree):
        os.chmod(current, 0o755)
        for name in names:
            path = Path(current) / name
            if not path.is_symlink():
                path.chmod(0o755 if path.stat().st_mode & 0o111 else 0o644)


def scan(tree):
    """Inventory rows of a tree: regular files and relative symlinks that stay inside."""
    files, symlinks = [], []
    root = tree.resolve()
    for current, directories, names in os.walk(tree):
        base = Path(current)
        for name in sorted(directories + names):
            path = base / name
            rel = path.relative_to(tree).as_posix()
            relative(rel)
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                link = os.readlink(path)
                check_link(rel, link)
                if not (path.parent / link).resolve().is_relative_to(root):
                    raise ValueError(f"Symlink leaves the tree: {rel}")
                symlinks.append({"path": rel, "target": link})
                if name in directories:
                    directories.remove(name)
            elif stat.S_ISREG(info.st_mode):
                files.append({"path": rel, "size": info.st_size, "sha256": digest(path),
                              "mode": 0 if os.name == "nt" else stat.S_IMODE(info.st_mode)})
            elif not stat.S_ISDIR(info.st_mode):
                raise ValueError(f"Unsupported file type in tree: {rel}")
    key = lambda row: row["path"].encode("utf-8")
    return sorted(files, key=key), sorted(symlinks, key=key)


def inventory_bytes(files, symlinks):
    body = {"schema": 1, "files": files, "symlinks": symlinks}
    return (json.dumps(body, indent=1, sort_keys=False, ensure_ascii=False) + "\n").encode("utf-8")


def tree_name(raw):
    """The tree is named by the sha256 of the exact bytes of inventory.json."""
    return hashlib.sha256(raw).hexdigest()[:12]


def folder_bytes(files, prefix):
    return sum(row["size"] for row in files if row["path"].startswith(prefix + "/"))


def check_windows_paths(files, symlinks):
    longest = max((row["path"] for row in files + symlinks), key=len)
    if len(WINDOWS_PREFIX) + len(longest) > WINDOWS_MAX_PATH:
        raise ValueError(f"Windows path too long under a long user profile ({len(WINDOWS_PREFIX) + len(longest)}): {longest}")
    return len(WINDOWS_PREFIX) + len(longest)


def seal(directory, target, pins, packages, extra=None):
    """Write inventory.json and manifest.json for the single staged tree in directory."""
    trees = [p for p in directory.iterdir() if p.is_dir() and p.name != "licenses"]
    if len(trees) != 1:
        raise ValueError("Expected exactly one staged tree")
    staged = trees[0]
    files, symlinks = scan(staged)
    if windows(target):
        if symlinks:
            raise ValueError("Windows trees cannot contain symlinks")
        check_windows_paths(files, symlinks)
    raw = inventory_bytes(files, symlinks)
    name = tree_name(raw)
    final = directory / name
    if staged != final:
        if final.exists():
            shutil.rmtree(final)
        staged.rename(final)
    (directory / "inventory.json").write_bytes(raw)
    entries = []
    for item in pins["entries"]:
        row = {"id": item["id"], "version": item["version"], "path": item["id"], "executable": item["executable"],
               "url": item["url"], "sha256": item["sha256"], "license": item["license"], "source": item["source"],
               "bytes": folder_bytes(files, item["id"])}
        entries.append(row)
    manifest = {"schema": 2, "layout": "tree", "target": target, "tree": name, "inventory": "inventory.json",
                "inventory_sha256": hashlib.sha256(raw).hexdigest(), "entries": entries,
                "documents": {"python": pins["documents"]["python"], "packages": packages, "imports": IMPORTS}}
    if extra:
        manifest.update(extra)
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def load_manifest(directory, target):
    data = json.loads((directory / "manifest.json").read_text())
    if data.get("schema") != 2 or data.get("layout") != "tree" or data.get("target") != target:
        raise ValueError("Manifest schema/layout/target mismatch")
    if data["inventory"] != "inventory.json" or not re.fullmatch(r"[0-9a-f]{12}", data["tree"]):
        raise ValueError("Unexpected inventory reference")
    if [e["id"] for e in data["entries"]] != [e["id"] for e in load_pins(RESOURCES / target, target)["entries"]]:
        raise ValueError("Manifest must list exactly the six authorized tools")
    for entry in data["entries"]:
        if entry["path"] != entry["id"] or (entry["executable"] is not None and not isinstance(entry["executable"], str)):
            raise ValueError("Unexpected tool path")
        if entry["executable"] is not None:
            relative(entry["executable"])
    return data


def verify_output(directory, target):
    """Byte-check a staged target directory against its pins and its own inventory."""
    source = RESOURCES / target
    pins = load_pins(source, target)
    manifest = load_manifest(directory, target)
    raw = (directory / "inventory.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["inventory_sha256"]:
        raise ValueError("Inventory checksum mismatch")
    inventory = json.loads(raw)
    if set(inventory) != {"schema", "files", "symlinks"} or inventory["schema"] != 1:
        raise ValueError("Unexpected inventory fields")
    if manifest["tree"] != manifest["inventory_sha256"][:12]:
        raise ValueError("Manifest tree must be inventory_sha256[:12]")
    files, symlinks = inventory["files"], inventory["symlinks"]
    if raw != inventory_bytes(files, symlinks):
        raise ValueError("Inventory is not canonical")
    tree = directory / manifest["tree"]
    actual_files, actual_links = scan(tree)
    if actual_files != files or actual_links != symlinks:
        raise ValueError("Tree differs from its inventory")
    pinned = {e["id"]: e for e in pins["entries"]}
    for entry in manifest["entries"]:
        pin = pinned[entry["id"]]
        for key in ["version", "executable", "url", "sha256", "license", "source"]:
            if entry[key] != pin[key]:
                raise ValueError(f"Manifest differs from pins: {entry['id']}.{key}")
        if entry["bytes"] != folder_bytes(files, entry["id"]):
            raise ValueError(f"Tool size mismatch: {entry['id']}")
        if entry["executable"] is not None and not child(tree / entry["id"], entry["executable"]).is_file():
            raise ValueError(f"Executable missing in tree: {entry['id']}")
    packages = [{"name": w["name"], "version": w["version"]} for w in pins["documents"]["wheels"]]
    if manifest["documents"] != {"python": pins["documents"]["python"], "packages": packages, "imports": IMPORTS}:
        raise ValueError("Documents metadata differs from pins")
    python = tree / "python"
    lib = stdlib(python, target)
    if not (lib / "EXTERNALLY-MANAGED").is_file():
        raise ValueError("Bundled Python must be marked EXTERNALLY-MANAGED")
    if not (python / ("python3.exe" if windows(target) else "bin/python")).exists():
        raise ValueError("Bundled Python lacks its python alias")
    if (directory / "browser-navigation.json").read_bytes() != (source / "browser-navigation.json").read_bytes():
        raise ValueError("Output Chrome catalog differs from checked-in pin")
    browser = json.loads((source / "browser-navigation.json").read_text())
    entry = browser["entry"]
    if (browser["schema"] != 1 or browser["target"] != target
            or entry["id"] != "browser-navigation" or entry["format"] != "zip"
            or entry["strip_components"] != 0 or type(entry["bytes"]) is not int or entry["bytes"] <= 0
            or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) or not entry["url"].startswith("https://")):
        raise ValueError("Invalid pinned Chrome navigation catalog")
    relative(entry["archive"])
    relative(entry["executable"])
    allowed = {"manifest.json", "inventory.json", "browser-navigation.json"}
    for license in (RESOURCES / "licenses").iterdir():
        if license.is_file():
            name = "licenses/" + license.name
            allowed.add(name)
            if child(directory, name).read_bytes() != license.read_bytes():
                raise ValueError(f"Output license differs from source: {name}")
    for path in directory.iterdir():
        name = path.name
        if path.is_symlink() or (path.is_dir() and name not in {manifest["tree"], "licenses"}) \
                or (path.is_file() and name not in allowed):
            raise ValueError(f"Unexpected resource (base must not contain Chrome or extra tools): {name}")
    for path in (directory / "licenses").iterdir():
        if "licenses/" + path.name not in allowed:
            raise ValueError(f"Unexpected license: {path.name}")
    report = {"target": target, "tree": manifest["tree"], "inventory_sha256": manifest["inventory_sha256"],
              "files": len(files), "symlinks": len(symlinks), "disk_bytes": sum(r["size"] for r in files),
              "tools": {e["id"]: e["bytes"] for e in manifest["entries"]}}
    if windows(target):
        report["windows_longest_path"] = check_windows_paths(files, symlinks)
    return report


def compiler_for(tree, target, others):
    own = tree / "python" / ("python.exe" if windows(target) else "bin/python3")
    if python_runs(own):
        return own
    # A cross build (x86_64 on Apple silicon) compiles with a runnable Python of the same minor.
    for other in others:
        if python_runs(other):
            return other
    found = shutil.which(f"python{json.loads((RESOURCES / target / 'pins.json').read_text())['documents']['python']}")
    if found:
        return Path(found)
    raise ValueError("No runnable Python of the bundled minor version to precompile bytecode")


def prepare(args, target, budget, compilers):
    source = RESOURCES / target
    pins = load_pins(source, target)
    dest = args.output / target
    store = args.output / ".payloads" / target
    if args.command == "prepare":
        for item in pins["entries"] + pins["documents"]["wheels"]:
            obtain(item, child(store, item["archive"]), args.cache, args.download, budget)
        verify_wheels(store, source, pins)
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        shutil.copyfile(source / "browser-navigation.json", dest / "browser-navigation.json")
        shutil.copytree(RESOURCES / "licenses", dest / "licenses")
        tree = dest / "staging"
        tree.mkdir()
        for item in pins["entries"]:
            path = child(store, item["archive"])
            if digest(path) != item["sha256"]:
                raise ValueError(f'Payload checksum mismatch: {item["id"]}')
            inspect_archive(path, item)
            extract(path, item, tree / item["id"])
            if item["id"] == "computer-use":
                keep_cua(tree / item["id"], target)
        if "apple-darwin" in target and not args.cross:
            verify_cua(tree / "computer-use", target)
        compiler = compiler_for(tree, target, compilers)
        packages = install_documents(tree, pins, store, source, target, compiler)
        normalize_modes(tree)
        manifest = seal(dest, target, pins, packages)
        if python_runs(dest / manifest["tree"] / "python" / ("python.exe" if windows(target) else "bin/python3")):
            compilers.append(dest / manifest["tree"] / "python" / ("python.exe" if windows(target) else "bin/python3"))
    return verify_output(dest, target)


def resources_inventory(output, targets):
    """Inventory of every resource the Linux AppImage copies, keyed by its final relative path."""
    files, symlinks = [], []
    for prefix, root in [("lenguas", LANGUAGES)] + [(f"work-tools/{t}", output / t) for t in targets]:
        found_files, found_links = scan(root)
        files += [{**row, "path": f"{prefix}/{row['path']}"} for row in found_files]
        symlinks += [{**row, "path": f"{prefix}/{row['path']}"} for row in found_links]
    key = lambda row: row["path"].encode("utf-8")
    return inventory_bytes(sorted(files, key=key), sorted(symlinks, key=key))


def verify_resources_inventory(root):
    """Every file and symlink the Linux inventory lists is in root with its bytes and mode."""
    inventory = json.loads((root / "resources-inventory.json").read_bytes())
    for row in inventory["files"]:
        path = child(root, row["path"])
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size != row["size"] or digest(path) != row["sha256"] \
                or (row["mode"] & 0o111 != 0) != (info.st_mode & 0o111 != 0):
            raise ValueError(f"Packaged resource differs from its inventory: {row['path']}")
    for row in inventory["symlinks"]:
        path = root.joinpath(*relative(row["path"]).parts)
        if not path.is_symlink() or os.readlink(path) != row["target"]:
            raise ValueError(f"Packaged symlink differs from its inventory: {row['path']}")
    return {"resources_inventory_sha256": digest(root / "resources-inventory.json"),
            "files": len(inventory["files"]), "symlinks": len(inventory["symlinks"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["plan", "prepare", "verify"])
    parser.add_argument("--target", required=True, action="append", choices=sorted(p.name for p in RESOURCES.iterdir() if (p / "pins.json").exists()))
    parser.add_argument("--output", type=Path, default=OUTPUT, help="Root containing target directories")
    parser.add_argument("--cache", action="append", type=Path, default=[])
    parser.add_argument("--download", action="store_true", help="Permit downloading missing base payloads (never Chrome)")
    parser.add_argument("--max-download-bytes", type=int, default=600 * 1024 * 1024)
    parser.add_argument("--cross", action="store_true", help="Build a macOS tree off macOS without checking Cua's signature; never for packaging")
    parser.add_argument("--tauri-config", type=Path, help="Generate a resource-only overlay; merge with platform/signing config")
    args = parser.parse_args()
    args.output = args.output.resolve()
    budget = [args.max_download_bytes]
    reports = []
    compilers = []
    for target in args.target:
        if args.command == "plan":
            reports.append(load_pins(RESOURCES / target, target))
        else:
            reports.append(prepare(args, target, budget, compilers))
    if args.tauri_config:
        if args.command == "plan":
            parser.error("Cannot generate a Tauri config before payload verification")
        write_tauri_config(args.output, args.target, args.tauri_config)
    print(json.dumps(reports, indent=2))


def write_tauri_config(output, targets, config):
    """Tauri's `resources` copy dereferences symlinks; macOS and AppImage `files` keep them."""
    trees = {target: str((output / target).resolve()) for target in targets}
    if all(windows(target) for target in targets):
        bundle = {"resources": {path: f"work-tools/{target}/" for target, path in trees.items()}}
    elif all("apple-darwin" in target for target in targets):
        bundle = {"macOS": {"files": {f"Resources/work-tools/{target}": path for target, path in trees.items()}}}
    elif all(target.endswith("linux-gnu") for target in targets):
        inventory = output / "resources-inventory.json"
        inventory.write_bytes(resources_inventory(output, targets))
        # linuxdeploy recorre usr/bin y usr/lib: en usr/share no copia dependencias ni toca un ELF.
        files = {f"/usr/share/Danil/work-tools/{target}": path for target, path in trees.items()}
        files["/usr/share/Danil/lenguas"] = str(LANGUAGES.resolve())
        files["/usr/share/Danil/resources-inventory.json"] = str(inventory.resolve())
        bundle = {"linux": {"appimage": {"files": files}}}
    else:
        raise ValueError("One Tauri overlay covers the targets of one platform")
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(json.dumps({"bundle": bundle}, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError, tarfile.TarError, zipfile.BadZipFile) as error:
        print(f"work-tools: {error}", file=sys.stderr)
        sys.exit(1)
