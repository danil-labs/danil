#!/usr/bin/env python3
"""Impide que linuxdeploy cambie los payloads fijados de la candidata local."""

import os
from pathlib import Path
import subprocess
import sys

root = Path(os.environ['TERMINUS_WORK_TOOLS_ROOT']).resolve()
if root.parts[-4:] != ('usr', 'share', 'Danil', 'work-tools'):
    raise ValueError('Expected the canonical AppDir work-tools root')
real = Path(os.environ['TERMINUS_REAL_PATCHELF']).resolve(strict=True)
args = sys.argv[1:]
protected = any(Path(arg).resolve().is_relative_to(root) for arg in args if not arg.startswith('--'))
if protected and len(args) == 3 and args[0] == '--set-rpath' and Path(args[-1]).resolve().is_relative_to(root):
    log = os.environ.get('TERMINUS_BUNDLE_PATCH_LOG')
    if log:
        with open(log, 'a') as output:
            output.write(str(Path(args[-1]).resolve()) + '\n')
    sys.exit(0)
if protected and not (len(args) == 2 and args[0].startswith('--print-')):
    raise ValueError('Unexpected patchelf operation on immutable work tools')
sys.exit(subprocess.call([str(real), *args]))
