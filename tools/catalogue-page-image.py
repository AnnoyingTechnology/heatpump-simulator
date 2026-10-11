#!/usr/bin/env python3
"""Render one primary-source PDF page for the multimodal research worker."""
import argparse
from pathlib import Path
import subprocess
import re

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('page', type=int)
args = parser.parse_args()
if not re.fullmatch(r'(?:mitsubishi|daikin)-[a-z0-9-]+', args.source):
    parser.error('Use a local manufacturer source identifier, without a path.')
cache = Path(__file__).resolve().parent.parent / 'research/catalogue/source-cache'
info = subprocess.run(['pdfinfo', str(cache / (args.source + '.pdf'))], capture_output=True, text=True, check=True).stdout
pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M)[1])
if not 1 <= args.page <= pages:
    parser.error(f'PDF page must be between1 and{pages}.')
prefix = cache / f'{args.source}-page-{args.page}'
subprocess.run(['pdftoppm', '-f', str(args.page), '-l', str(args.page), '-singlefile',
                '-scale-to', '2400', '-png', str(cache / (args.source + '.pdf')), str(prefix)], check=True)
print(prefix.with_suffix('.png'))
