#!/usr/bin/env python3
"""Render one primary-source PDF page for the multimodal research worker."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('source', choices=['mitsubishi-air-air-2026-2027'])
parser.add_argument('page', type=int)
args = parser.parse_args()
if not 1 <= args.page <= 274:
    parser.error('PDF page must be between 1 and 274.')
cache = Path(__file__).resolve().parent.parent / 'research/catalogue/source-cache'
prefix = cache / f'{args.source}-page-{args.page}'
subprocess.run(['pdftoppm', '-f', str(args.page), '-l', str(args.page), '-singlefile',
                '-scale-to', '2400', '-png', str(cache / (args.source + '.pdf')), str(prefix)], check=True)
print(prefix.with_suffix('.png'))
