import argparse
import importlib.util
import io
import json
import os
import shutil
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile


spec = importlib.util.spec_from_file_location("work_tools", Path(__file__).resolve().parents[2] / "scripts/work-tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


class WorkToolsTests(unittest.TestCase):
    def test_manifest_and_payload_paths_cannot_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ["../tool", "/tmp/tool", "C:/tool", "dir\\tool", ".", "a/../../b"]:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    tools.child(root, name)
            try:
                (root / "link").symlink_to(root.parent, target_is_directory=True)
            except OSError:
                if os.name == "nt":
                    return
                raise
            with self.assertRaises(ValueError):
                tools.child(root, "link/escaped")

    def test_bad_checksum_never_promotes_and_existing_payload_survives(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "payload"
            item = {"archive": "payload", "sha256": "0" * 64, "url": "https://example.invalid/tool"}
            with patch.object(tools.urllib.request, "urlopen") as fetch:
                fetch.return_value.__enter__.return_value = io.BytesIO(b"wrong bytes")
                fetch.return_value.__enter__.return_value.url = item["url"]
                with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                    tools.obtain(item, dest, [], True, [1024])
            self.assertFalse(dest.exists())
            self.assertEqual(list(Path(temp).iterdir()), [])
            dest.write_bytes(b"keep")
            with self.assertRaises(ValueError):
                tools.obtain(item, dest, [], True, [1024])
            self.assertEqual(dest.read_bytes(), b"keep")

    def test_budget_failure_cleans_partial_download(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "payload"
            item = {"archive": "payload", "sha256": "0" * 64, "url": "https://example.invalid/tool"}
            with patch.object(tools.urllib.request, "urlopen") as fetch:
                fetch.return_value.__enter__.return_value = io.BytesIO(b"too large")
                fetch.return_value.__enter__.return_value.url = item["url"]
                with self.assertRaisesRegex(ValueError, "budget"):
                    tools.obtain(item, dest, [], True, [1])
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_archive_rejects_traversal_links_and_missing_executable(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tool.tar.gz"
            item = {"format": "tar.gz", "strip_components": 1, "executable": "bin/tool"}
            for name, link in [("../escape", None), ("root/link", "../../escape"), ("root/other", None)]:
                with tarfile.open(path, "w:gz") as archive:
                    info = tarfile.TarInfo(name)
                    if link:
                        info.type = tarfile.SYMTYPE
                        info.linkname = link
                    archive.addfile(info)
                with self.subTest(name=name), self.assertRaises(ValueError):
                    tools.inspect_archive(path, item)
            with tarfile.open(path, "w:gz") as archive:
                info = tarfile.TarInfo("root/bin/tool")
                info.size = 2
                archive.addfile(info, io.BytesIO(b"ok"))
            self.assertEqual(tools.inspect_archive(path, item), 2)

    def lab(self, root, target="x86_64-unknown-linux-gnu"):
        """Pins and a staged tree shaped like a real target, without the real payloads."""
        source = root / "source"
        (source / target).mkdir(parents=True)
        (source / "licenses").mkdir()
        (source / "licenses" / "tool-LICENSE").write_text("MIT")
        entries = [dict(id=id, version="1.0", archive=f"payloads/{id}", sha256="a" * 64, format="raw",
                        executable=None if id == "computer-use" else ("tool.exe" if "windows" in target else "tool"),
                        url="https://example.invalid/" + id, license="MIT", source="https://example.invalid/src", strip_components=0)
                   for id in ["git", "python", "uv", "ripgrep", "agent-browser", "computer-use"]]
        wheel = dict(archive="documents/wheels/sample.whl", sha256="b" * 64, name="sample", version="1",
                     url="https://example.invalid/sample.whl", license="MIT")
        requirements = f'sample==1 --hash=sha256:{wheel["sha256"]}\n'
        (source / target / "documents-requirements.txt").write_text(requirements)
        pins = dict(schema=1, target=target, entries=entries, documents=dict(
            python="3.13", requirements="documents-requirements.txt", wheels=[wheel],
            requirements_sha256=tools.hashlib.sha256(requirements.encode()).hexdigest()))
        (source / target / "pins.json").write_text(json.dumps(pins))
        navigation = dict(schema=1, target=target, entry=dict(id="browser-navigation", format="zip", strip_components=0,
                          bytes=8, sha256="c" * 64, url="https://example.invalid/chrome", archive="chrome.zip", executable="chrome/browser"))
        (source / target / "browser-navigation.json").write_text(json.dumps(navigation))
        out = root / "out" / target
        tree = out / "staging"
        for entry in entries:
            (tree / entry["id"]).mkdir(parents=True)
            if entry["executable"]:
                (tree / entry["id"] / entry["executable"]).write_text(entry["id"])
        if "windows" in target:
            lib = tree / "python" / "Lib"
            (tree / "python" / "python3.exe").write_text("alias")
        else:
            lib = tree / "python" / "lib" / "python3.13"
            (tree / "python" / "bin").mkdir()
            (tree / "python" / "bin" / "python3.13").write_text("python")
            (tree / "python" / "bin" / "python").symlink_to("python3.13")
        (lib / "site-packages").mkdir(parents=True)
        (lib / "EXTERNALLY-MANAGED").write_text(tools.EXTERNALLY_MANAGED)
        shutil.copyfile(source / target / "browser-navigation.json", out / "browser-navigation.json")
        shutil.copytree(source / "licenses", out / "licenses")
        return source, out, pins

    def sealed(self, root, target="x86_64-unknown-linux-gnu"):
        source, out, pins = self.lab(root, target)
        with patch.object(tools, "RESOURCES", source):
            tools.normalize_modes(out / "staging")
            manifest = tools.seal(out, target, pins, [{"name": "sample", "version": "1"}])
        return source, out, manifest

    def test_sealed_tree_matches_the_interface_and_its_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            source, out, manifest = self.sealed(Path(temp))
            target = "x86_64-unknown-linux-gnu"
            self.assertEqual((manifest["schema"], manifest["layout"], manifest["inventory"]), (2, "tree", "inventory.json"))
            self.assertEqual([e["id"] for e in manifest["entries"]], ["git", "python", "uv", "ripgrep", "agent-browser", "computer-use"])
            self.assertNotIn("drawio", json.dumps(manifest))
            raw = (out / "inventory.json").read_bytes()
            self.assertEqual(manifest["inventory_sha256"], tools.hashlib.sha256(raw).hexdigest())
            inventory = json.loads(raw)
            # Enmienda 1: el motor exige tree == inventory_sha256[:12] y el inventario no lleva su nombre.
            self.assertEqual(manifest["tree"], tools.hashlib.sha256(raw).hexdigest()[:12])
            self.assertEqual(set(inventory), {"schema", "files", "symlinks"})
            self.assertEqual(sorted(p.name for p in out.iterdir()),
                             sorted(["browser-navigation.json", "inventory.json", "licenses", "manifest.json", manifest["tree"]]))
            paths = [row["path"] for row in inventory["files"]]
            self.assertEqual(paths, sorted(paths, key=lambda p: p.encode()))
            self.assertIn({"path": "python/bin/python", "target": "python3.13"}, inventory["symlinks"])
            self.assertEqual({row["mode"] for row in inventory["files"]}, {0o644})
            self.assertEqual(manifest["documents"]["imports"], tools.IMPORTS)
            # Decidido el 2026-10-29: pandas y matplotlib no van en la base.
            self.assertTrue({"pandas", "matplotlib", "numpy"}.isdisjoint(tools.IMPORTS))
            with patch.object(tools, "RESOURCES", source):
                self.assertEqual(tools.verify_output(out, target)["tree"], manifest["tree"])
                tree = out / manifest["tree"]
                (tree / "git" / "tool").write_text("tampered")
                with self.assertRaisesRegex(ValueError, "differs from its inventory"):
                    tools.verify_output(out, target)
                (tree / "git" / "tool").write_text("git")
                (out / "chrome.zip").write_text("forbidden")
                with self.assertRaisesRegex(ValueError, "Unexpected resource"):
                    tools.verify_output(out, target)

    def test_same_inputs_give_the_same_tree(self):
        with tempfile.TemporaryDirectory() as one, tempfile.TemporaryDirectory() as two:
            first = self.sealed(Path(one))[2]
            second = self.sealed(Path(two))[2]
            self.assertEqual(first["tree"], second["tree"])
            self.assertEqual(first["inventory_sha256"], second["inventory_sha256"])

    def test_links_must_stay_inside_and_windows_has_none(self):
        with tempfile.TemporaryDirectory() as temp:
            source, out, pins = self.lab(Path(temp))
            (out / "staging" / "git" / "escape").symlink_to("../../..")
            with patch.object(tools, "RESOURCES", source), self.assertRaises(ValueError):
                tools.seal(out, "x86_64-unknown-linux-gnu", pins, [])
        with tempfile.TemporaryDirectory() as temp:
            target = "x86_64-pc-windows-msvc"
            source, out, pins = self.lab(Path(temp), target)
            (out / "staging" / "git" / "link").symlink_to("tool.exe")
            with patch.object(tools, "RESOURCES", source), self.assertRaisesRegex(ValueError, "symlinks"):
                tools.seal(out, target, pins, [])

    def test_windows_paths_fit_max_path_under_a_long_profile(self):
        with tempfile.TemporaryDirectory() as temp:
            target = "x86_64-pc-windows-msvc"
            source, out, pins = self.lab(Path(temp), target)
            deep = out / "staging" / "python" / "Lib" / "site-packages" / ("p" * 120) / "module.py"
            deep.parent.mkdir(parents=True)
            deep.write_text("")
            with patch.object(tools, "RESOURCES", source), self.assertRaisesRegex(ValueError, "too long"):
                tools.seal(out, target, pins, [])

    def test_hard_links_become_copies_and_strip_applies(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "tool.tar.gz"
            with tarfile.open(path, "w:gz") as archive:
                info = tarfile.TarInfo("root/bin/git")
                info.size, info.mode = 3, 0o755
                archive.addfile(info, io.BytesIO(b"git"))
                link = tarfile.TarInfo("root/libexec/git-core/git-add")
                link.type, link.linkname = tarfile.LNKTYPE, "root/bin/git"
                archive.addfile(link)
            tools.extract(path, {"format": "tar.gz", "strip_components": 1, "executable": "bin/git"}, root / "git")
            copy = root / "git" / "libexec" / "git-core" / "git-add"
            self.assertEqual(copy.read_bytes(), b"git")
            self.assertFalse(copy.is_symlink())

    def test_cua_keeps_only_what_the_engine_runs(self):
        cases = {
            "x86_64-unknown-linux-gnu": (["cua-driver", "cua-cursor-theme", "wayland-helper"], "linux-x86_64"),
            "x86_64-pc-windows-msvc": (["cua-driver.exe", "cua-driver-uia.exe", "cua-cursor-theme.exe"], "windows-x86_64"),
            "aarch64-apple-darwin": (["CuaDriver.app/Contents/MacOS/cua-driver"], "darwin-universal"),
        }
        for target, (binaries, label) in cases.items():
            with self.subTest(target=target), tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / "computer-use"
                inner = root / f"cua-driver-rs-0.32.0-{label}"
                for name in binaries + ["LICENSE", "THIRD_PARTY_NOTICES.md", "libcua_driver_sdk.so",
                                        "cua_driver_node_runtime.node", "include/cua_driver.h", "cua-driver"]:
                    (inner / name).parent.mkdir(parents=True, exist_ok=True)
                    (inner / name).write_text(name)
                tools.keep_cua(root, target)
                expected = {name.split("/")[0] for name in binaries} | {"LICENSE", "THIRD_PARTY_NOTICES.md"}
                self.assertEqual({p.name for p in root.iterdir()}, expected)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "computer-use"
            (root / "cua-driver-rs-0.32.0-linux-x86_64").mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "lacks"):
                tools.keep_cua(root, "x86_64-unknown-linux-gnu")

    def test_tauri_overlay_keeps_symlinks_and_lists_linux_resources(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, out, manifest = self.sealed(root)
            languages = root / "languages"
            languages.mkdir()
            (languages / "es.json").write_text("{}")
            config = root / "tauri.json"
            with patch.object(tools, "RESOURCES", source), patch.object(tools, "LANGUAGES", languages):
                tools.write_tauri_config(out.parent, ["x86_64-unknown-linux-gnu"], config)
            files = json.loads(config.read_text())["bundle"]["linux"]["appimage"]["files"]
            self.assertIn("/usr/share/Danil/work-tools/x86_64-unknown-linux-gnu", files)
            inventory = json.loads(Path(files["/usr/share/Danil/resources-inventory.json"]).read_text())
            paths = {row["path"] for row in inventory["files"]}
            self.assertIn("lenguas/es.json", paths)
            self.assertIn(f"work-tools/x86_64-unknown-linux-gnu/{manifest['tree']}/git/tool", paths)
            self.assertIn(f"work-tools/x86_64-unknown-linux-gnu/{manifest['tree']}/python/bin/python",
                          {row["path"] for row in inventory["symlinks"]})
            mounted = root / "mounted"
            shutil.copytree(languages, mounted / "lenguas")
            shutil.copytree(out, mounted / "work-tools" / "x86_64-unknown-linux-gnu", symlinks=True)
            shutil.copyfile(files["/usr/share/Danil/resources-inventory.json"], mounted / "resources-inventory.json")
            self.assertEqual(tools.verify_resources_inventory(mounted)["files"], len(inventory["files"]))
            (mounted / "lenguas" / "es.json").write_text("[]")
            with self.assertRaisesRegex(ValueError, "differs from its inventory"):
                tools.verify_resources_inventory(mounted)
            for targets, key in [(["aarch64-apple-darwin", "x86_64-apple-darwin"], "macOS"), (["x86_64-pc-windows-msvc"], "resources")]:
                tools.write_tauri_config(out.parent, targets, config)
                self.assertIn(key, json.loads(config.read_text())["bundle"])


if __name__ == "__main__":
    unittest.main()
