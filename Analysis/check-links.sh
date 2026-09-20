#!/usr/bin/env python3
"""Verify every .md reference under Analysis/ and .claude/skills/ resolves:
markdown links [text](target) and bare `path.md` mentions alike.
Exit 1 on any dead reference (pre-commit / CI use)."""
import os
import re
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
link_re = re.compile(r'\]\(([^)]*\.md[^)]*)\)')
bare_re = re.compile(r'`([A-Za-z0-9_./-]*\.md)`')
dead = []
# Grandfathered: historical narrative (pre-reorg filenames), aspirational
# docs never written, and cross-checkout examples. Deliberately explicit:
# anything new and unresolvable still fails.
GRANDFATHERED = {
    'native-logic-reuse-decision.md',
    'RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md',
    '../../RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md',
    'INDEX.md', 'WebUIAnalysis.md', 'WebUIManualTweaks.md',
    'LessonsLearned.md',
    'Analysis/ISFRendererAnalysis.md', 'Analysis/RockyRoadXRAnalysis.md',
    'Camera3D.md', 'SongPlayer.md', 'web-audio-worklets.md',
    'xr-3d-rendering.md', 'v2/ARCHITECTURE.md',
    'engine/runtime-apis.md', 'engine/xr-3d-rendering.md',
    'RockyRoad/Analysis/lessons/engine/dev-environment.md',
    'RockyRoad/Analysis/lessons/engine/xr-3d-rendering.md',
    '../../RockyRoad/Analysis/lessons/engine/dev-environment.md',
    '../../RockyRoad/Analysis/lessons/engine/xr-3d-rendering.md',
    '../../RockyRoad/v2/ARCHITECTURE.md',
    '../../../RockyRoad/Analysis/lessons/README.md',
}


def check_file(path, dirpath):
    text = open(path).read()
    targets = set(link_re.findall(text)) | set(bare_re.findall(text))
    ws = os.path.dirname(root)  # workspace: sibling checkouts resolve here
    above = os.path.dirname(ws)  # parent of workspace (cross-checkout refs)
    bases = []
    d = dirpath
    while True:
        bases.append(d)
        if d in (root, ws, above, '/'):
            break
        d = os.path.dirname(d)
    bases += [root, ws, above]
    for t in sorted(targets):
        t = t.split('#')[0]
        if not t or t.startswith('http') or os.path.isabs(t):
            continue
        if any(os.path.exists(os.path.join(b, t)) for b in bases):
            continue
        if not os.path.normpath(os.path.join(dirpath, t)).startswith(ws):
            continue  # escapes the workspace, not verifiable here
        if t in GRANDFATHERED:
            continue
        dead.append(f'DEAD: {os.path.relpath(path, root)} -> {t}')


for base in ('Analysis', os.path.join('.claude', 'skills')):
    for dirpath, _, files in os.walk(os.path.join(root, base)):
        for fn in sorted(files):
            if fn.endswith('.md'):
                check_file(os.path.join(dirpath, fn), dirpath)

if dead:
    print('\n'.join(dead))
    sys.exit(1)
print('links OK')
