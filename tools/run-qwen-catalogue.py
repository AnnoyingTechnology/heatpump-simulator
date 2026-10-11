#!/usr/bin/env python3
"""Run the designated Qwen worker through a pre-established SSH tunnel.

Forward local19624 to loopback19623 on ai@10.10.10.204 before running.
All overrides are process-local; no global client configuration is edited.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--prompt', default='tools/qwen-catalogue-prompt.md')
parser.add_argument('--batch', default='mitsubishi-manifest')
parser.add_argument('--session')
args = parser.parse_args()
endpoint = 'http://127.0.0.1:19624/v1'
with urllib.request.urlopen(endpoint + '/models', timeout=10) as response:
    models = json.load(response)
assert any(m['id'] == 'Qwen3.8-Flash-Next' for m in models['data']), 'Requested model is unavailable'
provider = 'ai-multi-gpu-flash-next'
config = {
    '$schema': 'https://opencode.ai/config.json', 'autoupdate': False, 'share': 'disabled',
    'enabled_providers': [provider],
    'provider': {provider: {
        'npm': '@ai-sdk/openai-compatible', 'name': 'Qwen on 10.10.10.204',
        'options': {'baseURL': endpoint},
        'models': {'Qwen3.8-Flash-Next': {
            'name': 'Qwen3.8-Flash-Next · 10.10.10.204 · thinking off',
            'limit': {'context': 253952, 'output': 16384},
            'modalities': {'input': ['text', 'image'], 'output': ['text']},
            'options': {'reasoningEffort': 'none', 'temperature': 0.7, 'top_p': 0.8},
            'variants': {'off': {'reasoningEffort': 'none'}},
        }},
    }},
    'agent': {'catalogue': {'mode': 'primary', 'description': 'Source-backed equipment catalogue worker',
        'prompt': 'Follow the project catalogue research contract. Thinking is off. Read bounded source chunks, write staging candidates only, never infer missing manufacturer data. No global memory/config, git, deployment or infrastructure operations.'}},
    'permission': {
        '*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow',
        'webfetch': 'allow', 'websearch': 'allow', 'todowrite': 'allow',
        'edit': {'*': 'deny', 'research/catalogue/staging/*': 'allow', str(ROOT / 'research/catalogue/staging/*'): 'allow'},
        'bash': {'*': 'deny', 'python3 tools/catalogue-pages.py *': 'allow', 'python3 tools/catalogue-page-image.py *': 'allow', 'python3 tools/validate-catalogue.py *': 'allow'},
        'external_directory': 'deny',
    },
}
env = os.environ.copy()
env['OPENCODE_CONFIG_CONTENT'] = json.dumps(config)
command = ['opencode', 'run', '--pure', '--model', provider + '/Qwen3.8-Flash-Next',
           '--variant', 'off', '--agent', 'catalogue', '--format', 'json', '--title', args.batch]
if args.session:
    command += ['--session', args.session]
command.append((ROOT / args.prompt).read_text())
log = ROOT / 'tools' / ('qwen-' + args.batch + '-session.jsonl')
errors = ROOT / 'tools' / ('qwen-' + args.batch + '-stderr.log')
print(f'Starting Qwen3.8-Flash-Next on 10.10.10.204 with reasoningEffort=none; batch={args.batch}', flush=True)
with log.open('w') as output, errors.open('w') as stderr:
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=stderr)
print(f'Worker exit={result.returncode}; events={log.relative_to(ROOT)}', flush=True)
raise SystemExit(result.returncode)
