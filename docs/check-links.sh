#!/usr/bin/env python3
"""Verify every doc reference under docs/ and .claude/skills/ resolves:
markdown links [text](target), bare `path.md` mentions, and [[id]]/[[id#anchor]]
wikilinks alike. Exit 1 on any dead reference or id-index problem (duplicate
id, multiple Id: lines in one file, unresolvable [[id]]); a [[id]] that only
resolves through a Superseded-by: chain prints a warning instead of failing.
(pre-commit / CI use)."""
import os
import re
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
link_re = re.compile(r'\]\(([^)]*\.md[^)]*)\)')
bare_re = re.compile(r'`([A-Za-z0-9_./-]*\.md)`')
# Id:/Superseded-by: lines use the same "Key: value" style as this project's
# existing Status:/Tags:/Applies-when: lines -- see docs/README.md's "Citing
# other docs" convention. Ids are kebab-case and never contain '.', so they
# can never collide with bare_re's '...md' matches.
id_line_re = re.compile(r'^Id:\s*([a-z0-9-]+)\s*$', re.MULTILINE)
superseded_line_re = re.compile(r'^Superseded-by:\s*([a-z0-9-]+)\s*$', re.MULTILINE)
wikilink_re = re.compile(r'\[\[([a-z0-9-]+)(?:#([a-z0-9-]+))?\]\]')
heading_re = re.compile(r'^#{1,6}\s+(.+?)\s*$', re.MULTILINE)
title_re = re.compile(r'^#\s+(.+?)\s*$', re.MULTILINE)
IDS_INDEX_PATH = os.path.join('docs', '_ids.md')
dead = []
warnings = []
# Grandfathered: historical narrative (pre-reorg filenames), aspirational
# docs never written, and cross-checkout examples. Deliberately explicit:
# anything new and unresolvable still fails.
GRANDFATHERED = {
    'native-logic-reuse-decision.md',
    'RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md',
    '../../RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md',
    'INDEX.md', 'WebUIAnalysis.md', 'WebUIManualTweaks.md',
    'LessonsLearned.md',
    'docs/ISFRendererAnalysis.md', 'docs/RockyRoadXRAnalysis.md',
    'Camera3D.md', 'SongPlayer.md', 'web-audio-worklets.md',
    'xr-3d-rendering.md', 'v2/ARCHITECTURE.md',
    'engine/runtime-apis.md', 'engine/xr-3d-rendering.md',
    'RockyRoad/docs/lessons/engine/dev-environment.md',
    'RockyRoad/docs/lessons/engine/xr-3d-rendering.md',
    '../../RockyRoad/docs/lessons/engine/dev-environment.md',
    '../../RockyRoad/docs/lessons/engine/xr-3d-rendering.md',
    '../../RockyRoad/v2/ARCHITECTURE.md',
    '../../../RockyRoad/docs/lessons/README.md',
    # UpstreamFindings.md moved to planning/ (root -> docs/planning/,
    # Id: upstream-findings assigned); these bare-filename citations are in
    # append-only docs/log/*.md entries, which record what was true on their
    # own date and aren't rewritten for later moves.
    'UpstreamFindings.md',
    'docs/UpstreamFindings.md',
}


def strip_code(text):
    """[[id]] is only a real citation outside of code spans -- same rule
    Obsidian/Foam use, so a doc can show '`[[id]]`' as a syntax example
    (like this project's own docs/README.md convention section) without it
    being treated as a dead/real reference."""
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'`[^`]*`', '', text)
    return text


def slugify(heading):
    """Approximates GitHub's heading-anchor algorithm closely enough to
    verify a [[id#anchor]] target exists -- doesn't handle GitHub's
    duplicate-heading '-1' suffixing, since anchors should cite a unique
    heading in the first place."""
    s = heading.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    return s


def find_all_md_files():
    for base in ('docs', os.path.join('.claude', 'skills')):
        for dirpath, _, files in os.walk(os.path.join(root, base)):
            for fn in sorted(files):
                if fn.endswith('.md'):
                    yield os.path.join(dirpath, fn)


# --- Pass 1: build the id index (id -> path, id -> heading-slug set,
# id -> superseded-by) across every doc, regardless of which subtree it's
# in -- this is what lets [[id]] resolve sideways, unlike the upward-only
# directory walk path/bare-filename citations rely on. ---
id_to_path = {}
id_to_slugs = {}
id_to_superseded_by = {}
id_to_title = {}
for path in find_all_md_files():
    if os.path.relpath(path, root) == IDS_INDEX_PATH:
        continue  # the generated index is never itself a citable id source
    text = open(path).read()
    ids = id_line_re.findall(text)
    if len(ids) > 1:
        dead.append(f'MULTIPLE Id: lines in {os.path.relpath(path, root)}: {ids}')
        continue
    if not ids:
        continue
    doc_id = ids[0]
    if doc_id in id_to_path:
        dead.append(
            f'DUPLICATE id {doc_id!r}: {id_to_path[doc_id]} and '
            f'{os.path.relpath(path, root)}'
        )
        continue
    id_to_path[doc_id] = os.path.relpath(path, root)
    id_to_slugs[doc_id] = {slugify(h) for h in heading_re.findall(text)}
    title_match = title_re.search(text)
    id_to_title[doc_id] = title_match.group(1) if title_match else doc_id
    superseded = superseded_line_re.findall(text)
    if superseded:
        id_to_superseded_by[doc_id] = superseded[0]


def resolve_id(doc_id, anchor, citing_path):
    """Returns None if fully resolved (dead/warnings already recorded as
    needed). A Superseded-by: always redirects -- even if the superseded
    id's own file still physically exists -- since the point is to flag
    the citation as stale, not just to keep it from going dead."""
    seen = set()
    current = doc_id
    chain = []
    while current in id_to_superseded_by and current not in seen:
        seen.add(current)
        chain.append(current)
        current = id_to_superseded_by[current]
    if current not in id_to_path:
        dead.append(f'DEAD: {os.path.relpath(citing_path, root)} -> [[{doc_id}]] (no such id)')
        return
    if chain:
        warnings.append(
            f'SUPERSEDED: {os.path.relpath(citing_path, root)} -> [[{doc_id}]] '
            f'now resolves via {" -> ".join(chain)} -> {current}; update the citation'
        )
    if anchor and anchor not in id_to_slugs.get(current, set()):
        dead.append(
            f'DEAD: {os.path.relpath(citing_path, root)} -> [[{doc_id}#{anchor}]] '
            f'(no matching heading in {id_to_path[current]})'
        )


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
    for doc_id, anchor in wikilink_re.findall(strip_code(text)):
        resolve_id(doc_id, anchor or None, path)


def write_ids_index():
    """Generated, never hand-edited -- regenerated every run so it can't
    drift the way a hand-maintained index could (see the debugging-method.md
    entry-count staleness check-lessons.sh caught after the dev-branch
    merge). The human lookup path for [[id]] citations, which render as
    plain bracketed text on GitHub with no live resolver behind them."""
    lines = [
        '# Doc id index',
        '',
        'Generated by `check-links.sh` -- do not hand-edit, it is overwritten',
        'every run. Human lookup for `[[id]]` citations elsewhere in `docs/`.',
        '',
        '| Id | Path | Title |',
        '|---|---|---|',
    ]
    docs_dir = os.path.join(root, 'docs')
    for doc_id in sorted(id_to_path):
        rel = os.path.relpath(os.path.join(root, id_to_path[doc_id]), docs_dir)
        title = id_to_title[doc_id]
        note = ''
        if doc_id in id_to_superseded_by:
            note = f' (superseded by `{id_to_superseded_by[doc_id]}`)'
        lines.append(f'| `{doc_id}` | [{rel}]({rel}) | {title}{note} |')
    lines.append('')
    with open(os.path.join(docs_dir, '_ids.md'), 'w') as f:
        f.write('\n'.join(lines))


for path in find_all_md_files():
    check_file(path, os.path.dirname(path))

write_ids_index()

if warnings:
    print('\n'.join(warnings))
if dead:
    print('\n'.join(dead))
    sys.exit(1)
print('links OK')
