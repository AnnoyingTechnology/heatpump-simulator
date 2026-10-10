"""Retain upstream notices and resolved dependency identities for this artifact."""
from pathlib import Path
import json
import shutil
import subprocess
import hashlib

root = Path(__file__).resolve().parents[2]
deps = root / 'tools/coolprop-safe/work/build/_deps'
target = root / 'public/vendor/coolprop-safe/licenses'
target.mkdir(exist_ok=True)
pins = {}
for source in sorted(deps.glob('*-src')):
    name = source.name.removesuffix('-src')
    if (source / '.git').exists():
        assert subprocess.run(['git', '-C', str(source), 'diff', '--quiet', 'HEAD']).returncode == 0, f'Dirty dependency {name}'
        pins[name] = {'commit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()}
    else:
        archives = {
            'eigen': {'version': '5.0.1', 'archiveSHA256': 'e9c326dc8c05cd1e044c71f30f1b2e34a6161a3b6ecf445d56b53ff1669e3dec'},
            'valijson': {'version': '1.0.6', 'archiveSHA256': 'bf0839de19510ff7792d8a8aca94ea11a288775726b36c4c9a2662651870f8da'},
        }
        pins[name] = archives[name]  # CMake verifies the pinned archive hash.
        digest = hashlib.sha256()
        for item in sorted(source.rglob('*')):
            if item.is_file():
                digest.update(item.relative_to(source).as_posix().encode() + b'\0')
                digest.update(hashlib.sha256(item.read_bytes()).digest())
        pins[name]['extractedTreeSHA256'] = digest.hexdigest()
    for notice in source.iterdir():
        if notice.is_file() and (notice.name.startswith('LICENSE') or notice.name.startswith('COPYING')):
            shutil.copyfile(notice, target / f'{name}-{notice.name}')
pinfile = root / 'tools/coolprop-safe/dependency-pins.json'
if pinfile.exists():
    assert json.loads(pinfile.read_text()) == pins, 'Resolved upstream dependency identity changed'
else:
    pinfile.write_text(json.dumps(pins, indent=2) + '\n')
# Bundled miniz has its copyright/license in its header rather than a top-level file.
miniz = root / 'tools/coolprop-safe/work/source/externals/miniz-3.1.1/miniz.c'
text = miniz.read_text()
end = text.find('*/')
(target / 'miniz-header-notice.txt').write_text(text[:end + 2] + '\n')
# The pinned multicomplex repository declares MIT in README but contains no
# top-level LICENSE. Retain that exact declaration; do not invent its notice.
shutil.copyfile(deps / 'multicomplex-src/README.md', target / 'multicomplex-README.md')
