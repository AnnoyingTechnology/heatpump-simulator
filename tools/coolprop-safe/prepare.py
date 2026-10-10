"""Deterministic narrow patch to the pinned official Javascript target."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'tools/coolprop-safe/work/source'
changed = subprocess.check_output(['git', '-C', str(source), 'diff', '--name-only', 'HEAD'], text=True).splitlines()
assert set(changed) <= {'CMakeLists.txt', 'src/emscripten_interface.cxx'}, 'Uncontrolled tracked CoolProp source edits'
# Recover just the known build recipe on repeated builds; never mutate project code.
cmake = subprocess.check_output(['git', '-C', str(source), 'show', 'HEAD:CMakeLists.txt'], text=True)
original = '-lembind ${EMSCRIPTEN_INIT_FLAG} -s ASSERTIONS=1 -s DISABLE_EXCEPTION_CATCHING=0 -sALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1 -s MODULARIZE=1'
replacement = ('${EMSCRIPTEN_INIT_FLAG} -s ASSERTIONS=1 -s DISABLE_EXCEPTION_CATCHING=0 '
               '-sALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1 -s MODULARIZE=1 '
               '-sEXPORTED_FUNCTIONS=_malloc,_free '
               '-sEXPORTED_RUNTIME_METHODS=ccall,UTF8ToString')
assert cmake.count(original) == 1, 'Pinned build recipe changed'
(source / 'CMakeLists.txt').write_text(cmake.replace(original, replacement))
shutil.copyfile(root / 'tools/coolprop-safe/safe-interface.cpp', source / 'src/emscripten_interface.cxx')
