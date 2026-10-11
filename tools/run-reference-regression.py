#!/usr/bin/env python3
"""Compile and test an immutable release snapshot while other agents work."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--concurrency', type=int, default=3)
parser.add_argument('--receipt', default='reviews/indoor-moisture-reference-regression-results.json')
parser.add_argument('--test-file', action='append', help='Run only this released check; repeat for a focused immutable verification.')
args = parser.parse_args()
snapshot = Path(tempfile.mkdtemp(prefix='heatpump-reference-regression-'))
sources = ('src/engine', 'public/vendor/coolprop-safe', 'tests/engine',
           'reviews/robustness-final-seeded-failures', 'reviews/robustness-ordinary-UA-counterexamples')
for source in sources:
    shutil.copytree(ROOT / source, snapshot / source, ignore=shutil.ignore_patterns('build'))
(snapshot / 'package.json').write_text('{"type":"module"}\n')
hashes = {}
for prefix in sources:
    for path in (snapshot / prefix).rglob('*'):
        if path.is_file():
            hashes[str(path.relative_to(snapshot))] = hashlib.sha256(path.read_bytes()).hexdigest()
workflow = (ROOT / '.github/workflows/pages.yml').read_text()
released_files = re.findall(r'tests/engine/[\w-]+\.test\.mjs', workflow)
files = args.test_file or released_files
if any(file not in released_files for file in files):
    raise SystemExit('Focused checks must be listed in the release workflow')
for file in files:
    if not (snapshot / file).exists():
        raise SystemExit(f'Missing release check: {file}')
subprocess.run([str(ROOT / 'node_modules/.bin/tsc'), '-p', str(snapshot / 'tests/engine/tsconfig.json')], check=True)
started = time.monotonic()
log = snapshot / 'regression.tap'
with log.open('w') as stream:
    result = subprocess.run(['node', '--test', f'--test-concurrency={max(1, min(12, args.concurrency))}', *files],
                            cwd=snapshot, env={**os.environ, 'HEATPUMP_TEST_BACKEND':'guarded'},
                            stdout=stream, stderr=subprocess.STDOUT)
output = log.read_text()
summary = {}
for key in ('tests', 'pass', 'fail', 'duration_ms'):
    matches = re.findall(r'^[#ℹ] ' + key + r' (.*)$', output, re.M)
    if matches:
        summary[key] = float(matches[-1]) if key == 'duration_ms' else int(matches[-1])
receipt = {'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'exitCode':result.returncode, 'wallSeconds':time.monotonic()-started,
           'backend':'guarded', 'testConcurrency':args.concurrency, 'selection':'focused' if args.test_file else 'complete-release', 'files':files,
           'sourceHashes':hashes, 'summary':summary, 'immutableSnapshot':str(snapshot), 'log':str(log)}
(ROOT / args.receipt).write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ('exitCode','wallSeconds','summary','immutableSnapshot')}), flush=True)
raise SystemExit(result.returncode)
