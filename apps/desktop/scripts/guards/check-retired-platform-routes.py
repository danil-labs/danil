ROOTS = ("apps", "packages")
import re
import subprocess
from pathlib import Path

RETIRED = re.compile(
    r"/v1/(?:bff(?:/|[\x22\x27`])|shared-computers\b|admin/computers\b|"
    r"git-hosts/(?!github\b)|computers/self/git-hosts/(?!github\b)|"
    r"workspaces/[^\s\x22\x27`]+/free-router-consent\b)"
    r"|/auth/account/business\b"
)

files = subprocess.check_output(["git", "ls-files", "-z", "--", *ROOTS]).decode().split("\0")
found = False
for name in files:
    path = Path(name)
    if path.suffix not in {".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs"}:
        continue
    if {"test", "tests", "scripts"} & set(path.parts) or ".test." in path.name:
        continue
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.lstrip().startswith(("//", "*")) and RETIRED.search(line):
            print(f"{name}:{number}: retired route")
            found = True
raise SystemExit(int(found))
