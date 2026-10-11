#!/usr/bin/env python3
"""Cache a worker-selected official Daikin PDF, without broader host access."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('url')
args = parser.parse_args()
parts = urlsplit(args.url)
hosts = {'www.daikin.fr', 'daikin.fr', 'www.daikin.eu', 'daikin.eu',
         'www.daikin.com', 'daikin.com', 'my.daikin.eu'}
if not re.fullmatch(r'daikin-[a-z0-9-]+', args.source):
    parser.error('Use a lowercase daikin- source identifier, without a path.')
if parts.scheme != 'https' or parts.hostname not in hosts or parts.username or parts.password:
    parser.error('Only credential-free HTTPS official Daikin sources are allowed.')
cache = Path(__file__).resolve().parent.parent / 'research/catalogue/source-cache'
cache.mkdir(exist_ok=True)
target = cache / (args.source + '.pdf')
if target.exists():
    parser.error('Source already exists; do not overwrite dated evidence.')
request = Request(args.url, headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0'})
with urlopen(request, timeout=45) as response:
    final = urlsplit(response.url)
    if final.scheme != 'https' or final.hostname not in hosts:
        parser.error('Redirect left the allowed official source hosts.')
    data = response.read(100*1024*1024 + 1)
    resolved = response.url
if len(data) > 100*1024*1024 or not data.startswith(b'%PDF-'):
    parser.error('Expected an official PDF no larger than100 MiB.')
target.write_bytes(data)
subprocess.run(['pdftotext','-layout',str(target),str(target.with_suffix('.txt'))],check=True)
info = subprocess.run(['pdfinfo',str(target)],capture_output=True,text=True,check=True).stdout
pages = int(re.search(r'^Pages:\s+(\d+)',info,re.M)[1])
metadata = {'sourceId':args.source, 'url':args.url, 'resolvedUrl':resolved,
            'bytes':len(data), 'pages':pages, 'sha256':hashlib.sha256(data).hexdigest()}
target.with_suffix('.metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata))
