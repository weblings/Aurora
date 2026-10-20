#!/usr/bin/env python3
"""Close gate (pre-commit use): for every bead this commit closes (closed in
the staged .beads/issues.jsonl, not in HEAD's), require a docs/log/ entry
(staged here, else already tracked) naming it with a lessons record (a non-empty `## Lessons` section or a
`- Lessons: ...` line, "none" counts), and a docs/log/INDEX.md
row naming it. Also blocks when the working-tree export shows closes that were
never staged. Prints the AGENTS.md close checklist and exits 1 on any gap.
Bypass: AURORA_SKIP_CLOSE_GATE=1 or `git commit --no-verify`."""
import json
import os
import re
import subprocess
import sys

EXPORT = '.beads/issues.jsonl'
INDEX = 'docs/log/INDEX.md'
lessons_section_re = re.compile(r'^## Lessons[ \t]*\n(.*?)(?=^## |\Z)', re.MULTILINE | re.DOTALL)
lessons_line_re = re.compile(r'^[-*]?\s*Lessons:\s*\S', re.MULTILINE)


def has_lessons(text):
    m = lessons_section_re.search(text)
    return bool(m and m.group(1).strip()) or bool(lessons_line_re.search(text))


def git(*args):
    r = subprocess.run(['git', *args], capture_output=True, text=True, encoding='utf-8')
    return r.stdout if r.returncode == 0 else None


def statuses(text):
    out = {}
    for line in (text or '').splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('_type', 'issue') == 'issue' and 'id' in d:
            out[d['id']] = d.get('status')
    return out


def newly_closed(new, old):
    return sorted(i for i, s in new.items() if s == 'closed' and old.get(i) != 'closed')


def names(bead_id):
    # Aurora-5ipy.1 must not match Aurora-5ipy.10 or Aurora-5ipy.1.2
    return re.compile(re.escape(bead_id) + r'(?!\w|\.\w)')


def main():
    if os.environ.get('AURORA_SKIP_CLOSE_GATE') == '1':
        return 0
    os.chdir(git('rev-parse', '--show-toplevel').strip())
    head = statuses(git('show', 'HEAD:' + EXPORT))
    staged = statuses(git('show', ':' + EXPORT))
    try:
        with open(EXPORT, encoding='utf-8') as f:
            worktree = statuses(f.read())
    except OSError:
        worktree = {}

    closing = newly_closed(staged, head)
    unstaged = [i for i in newly_closed(worktree, head) if i not in closing]
    if not closing and not unstaged:
        return 0

    index = git('show', ':' + INDEX) or ''

    problems = []
    for bead in unstaged:
        problems.append(f'{bead}: closed in the working-tree export but the export is not staged')
    for bead in closing:
        pat = names(bead)
        # Index (staged) content, so a log closed earlier and swept into this export counts
        logs = {}
        for p in (git('grep', '--cached', '-l', '-F', bead, '--', 'docs/log/') or '').split():
            text = git('show', ':' + p) or ''
            if p not in (INDEX, 'docs/log/README.md') and pat.search(text):
                logs[p] = text
        if not logs:
            problems.append(f'{bead}: no docs/log/ entry names it')
        elif not any(has_lessons(t) for t in logs.values()):
            problems.append(f'{bead}: {", ".join(logs)} records no lessons '
                            '("## Lessons" section or "- Lessons:" line)')
        if not pat.search(index):
            problems.append(f'{bead}: no {INDEX} row names it')
    if not problems:
        return 0

    beads = ' '.join(closing + unstaged)
    print(f'close gate: this commit closes {beads} but the close steps are incomplete:', file=sys.stderr)
    for p in problems:
        print(f'  - {p}', file=sys.stderr)
    print(f"""
Before committing (AGENTS.md "Before any commit that closes a bead"):
  1. Update the work log: write or update the docs/log/ entry for each bead
     (name the bead id) and add its INDEX.md row.
  2. Capture lessons learned: file any per docs/lessons/README.md (bump the
     README count) and list them in the log under "## Lessons" or a
     "- Lessons:" line, or record "none".
  3. bd export -o {EXPORT}, then stage the export, log, INDEX and lessons.
  4. Rerun the commit. The doc checkers (check-lessons.sh, check-links.py) run next.
Bypass for a close that needs no log: AURORA_SKIP_CLOSE_GATE=1 git commit ...""", file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
