#!/usr/bin/env python3
"""Read bounded, explicitly numbered PDF-text pages for the catalogue worker."""
import argparse
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('first', type=int)
parser.add_argument('last', type=int, nargs='?')
args = parser.parse_args()
if not re.fullmatch(r'(?:mitsubishi|daikin)-[a-z0-9-]+', args.source):
    parser.error('Use a registered local manufacturer source identifier, without a path.')
last = args.last if args.last is not None else args.first
path = Path(__file__).resolve().parent.parent / 'research/catalogue/source-cache' / (args.source + '.txt')
pages = path.read_text().split('\f')
if not 1 <= args.first <= last <= len(pages) or last - args.first > 4:
    parser.error('Use valid PDF page numbers, at most five pages per request.')
for page in range(args.first, last + 1):
    print(f'\nPDF PAGE {page}\n{pages[page-1]}')
