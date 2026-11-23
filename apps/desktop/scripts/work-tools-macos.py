#!/usr/bin/env python3
"""Firma en su sitio el código Mach-O del árbol de herramientas de macOS y lo vuelve a sellar."""

import argparse
import base64
import csv
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import secrets
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("work_tools", ROOT / "scripts/work-tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)
MAGIC = {b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",
         b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xce"}


def execute(args, label, timeout=120):
    try:
        result = subprocess.run([str(a) for a in args], capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{label}: timeout") from None
    if result.returncode:
        # Las órdenes de security llevan secretos; sus argumentos nunca entran en el error.
        raise RuntimeError(f"{label}: {result.stderr.decode(errors='replace')[-2000:]}")
    return result.stdout.decode(errors="replace") + result.stderr.decode(errors="replace")


def native_files(root):
    result = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open("rb") as stream:
            magic = stream.read(4)
        if magic in MAGIC:
            description = execute(["/usr/bin/file", "-b", path], "inspect Mach-O")
            if "Mach-O" in description and ("executable" in description or "shared library" in description or "bundle" in description):
                result.append((path, "executable" in description))
    return result


def signature(path, executable, team=None):
    execute(["/usr/bin/codesign", "--verify", "--strict", path], "verify native signature")
    info = execute(["/usr/bin/codesign", "-dv", "--verbose=4", path], "inspect native signature")
    if "Authority=Developer ID Application:" not in info or "Timestamp=" not in info or "Timestamp=none" in info:
        raise ValueError(f"Developer ID and secure timestamp required: {path.name}")
    if executable and "runtime" not in info:
        raise ValueError(f"Hardened runtime required: {path.name}")
    if team and f"TeamIdentifier={team}\n" not in info:
        raise ValueError(f"Unexpected native signing team: {path.name}")
    if team and "Authority=Developer ID Application: Software y Servicios Danil" not in info:
        raise ValueError(f"Expected Danil Developer ID: {path.name}")


class Signer:
    def __init__(self, identity, team, keychain, entitlements):
        self.identity, self.team = identity, team
        self.keychain, self.entitlements = keychain, entitlements

    def sign(self, path, python):
        command = ["/usr/bin/codesign", "--force", "--sign", self.identity, "--timestamp", "--options", "runtime",
                   "--keychain", self.keychain]
        if python:
            command += ["--entitlements", self.entitlements]
        for attempt in range(3):
            try:
                execute(command + [path], "sign native payload")
                return
            except RuntimeError:
                if attempt == 2:
                    raise
                time.sleep(2)


def signing_identity(keychain, configured, team):
    listing = execute(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning", keychain],
                      "resolve imported signing identity")
    candidates = []
    for fingerprint, name in re.findall(r'\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"]+)"', listing):
        if (name.startswith("Developer ID Application: Software y Servicios Danil")
                and name.endswith(f"({team})")
                and (configured in name or configured.lower() == fingerprint.lower())):
            candidates.append(fingerprint)
    if len(candidates) != 1:
        raise ValueError("Expected one valid imported Danil Developer ID matching the configured identity and team")
    return candidates[0]


def sign_tree(directory, target, signer):
    """Firma en su sitio el código Mach-O del árbol y vuelve a sellar inventario y manifiesto."""
    manifest = tools.verify_output(directory, target)
    tree = directory / manifest["tree"]
    tools.verify_cua(tree / "computer-use", target)
    signed = []
    seen = set()
    for p, executable in native_files(tree):
        rel = p.relative_to(tree).as_posix()
        # Cua conserva la firma original de su bundle.
        if rel.startswith("computer-use/"):
            continue
        inode = (p.stat().st_dev, p.stat().st_ino)
        if inode in seen:
            continue
        seen.add(inode)
        try:
            signature(p, executable)
        except (ValueError, RuntimeError):
            before = tools.digest(p)
            signer.sign(p, rel.startswith("python/") and executable)
            signature(p, executable, signer.team)
            signed.append({"path": rel, "source_sha256": before, "sha256": tools.digest(p)})
    records(tree / "python", target, signed)
    pins = tools.load_pins(tools.RESOURCES / target, target)
    packages = [{"name": w["name"], "version": w["version"]} for w in pins["documents"]["wheels"]]
    receipt = {"schema": 2, "team_id": signer.team, "unsigned_tree": manifest["tree"],
               "unsigned_inventory_sha256": manifest["inventory_sha256"], "signed": signed}
    tools.seal(directory, target, pins, packages, {"macos_signing": receipt})
    return verify_signed(directory, target, signer.team)


def records(python, target, signed):
    """Los RECORD de los wheels siguen describiendo los .so ya firmados."""
    site = tools.stdlib(python, target) / "site-packages"
    changed = {}
    for row in signed:
        path = python.parent / row["path"]
        if path.is_relative_to(site):
            changed[path.relative_to(site).as_posix()] = path
    if not changed:
        return
    for record in site.glob("*.dist-info/RECORD"):
        rows = list(csv.reader(io.StringIO(record.read_text())))
        touched = False
        for row in rows:
            if row and row[0] in changed:
                data = changed[row[0]].read_bytes()
                row[1:] = ["sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("="), str(len(data))]
                touched = True
        if touched:
            stream = io.StringIO()
            csv.writer(stream, lineterminator="\n").writerows(rows)
            record.write_text(stream.getvalue())


def verify_signed(directory, target, team):
    report = tools.verify_output(directory, target)
    manifest = tools.load_manifest(directory, target)
    receipt = manifest.get("macos_signing", {})
    if not team or receipt.get("schema") != 2 or receipt.get("team_id") != team:
        raise ValueError("Native signing provenance/team mismatch")
    tree = directory / manifest["tree"]
    tools.verify_cua(tree / "computer-use", target)
    ours = {row["path"]: row for row in receipt["signed"]}
    native = {p.relative_to(tree).as_posix(): (p, executable) for p, executable in native_files(tree)}
    if not set(ours) <= set(native):
        raise ValueError("Native code inventory mismatch")
    for rel, (p, executable) in native.items():
        if rel.startswith("computer-use/"):
            continue
        if rel in ours and ours[rel]["sha256"] != tools.digest(p):
            raise ValueError("Native code checksum mismatch")
        signature(p, executable, team if rel in ours else None)
    report["signed"] = len(ours)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    if platform.system() != "Darwin":
        raise ValueError("Native resource signing requires macOS")
    identity, team = os.environ["APPLE_SIGNING_IDENTITY"], os.environ["APPLE_TEAM_ID"]
    if not identity or not team:
        raise ValueError("Expected the configured Danil Developer ID")
    with tempfile.TemporaryDirectory(prefix="terminus-signing-keychain-") as temporary:
        root = Path(temporary)
        keychain, certificate = root / "payloads.keychain-db", root / "certificate.p12"
        password = secrets.token_hex(32)
        certificate.write_bytes(base64.b64decode("".join(os.environ["APPLE_CERTIFICATE"].split()), validate=True))
        certificate.chmod(0o600)
        entitlements = root / "python.plist"
        entitlements.write_bytes(plistlib.dumps({"com.apple.security.cs.disable-library-validation": True}))
        keychains = execute(["/usr/bin/security", "list-keychains", "-d", "user"], "read signing keychain search list")
        previous = re.findall(r'"([^"]+)"', keychains)
        created = False
        try:
            execute(["/usr/bin/security", "create-keychain", "-p", password, keychain], "create signing keychain")
            created = True
            execute(["/usr/bin/security", "set-keychain-settings", "-lut", "21600", keychain], "configure signing keychain")
            execute(["/usr/bin/security", "unlock-keychain", "-p", password, keychain], "unlock signing keychain")
            certificate_format = "pemseq" if certificate.read_bytes().lstrip().startswith(b"-----BEGIN ") else "pkcs12"
            execute(["/usr/bin/security", "import", certificate, "-f", certificate_format, "-t", "agg", "-k", keychain,
                     "-P", os.environ["APPLE_CERTIFICATE_PASSWORD"],
                     "-T", "/usr/bin/codesign"], "import signing identity")
            execute(["/usr/bin/security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password,
                     keychain], "authorize native signing")
            execute(["/usr/bin/security", "list-keychains", "-d", "user", "-s", *previous, keychain],
                    "make imported signing identity available")
            signer = Signer(signing_identity(keychain, identity, team), team, keychain, entitlements)
            target = "aarch64-apple-darwin"
            print(json.dumps(sign_tree(args.directory / target, target, signer)))
        finally:
            if created:
                try:
                    execute(["/usr/bin/security", "list-keychains", "-d", "user", "-s", *previous],
                            "restore signing keychain search list")
                finally:
                    execute(["/usr/bin/security", "delete-keychain", keychain], "remove temporary signing keychain")


if __name__ == "__main__":
    main()
