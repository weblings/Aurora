# Public launch (2026-09-21)

Repo flipped public; zero-install demo live at
https://weblings.github.io/Aurora/ via a `gh-pages` branch.

## Pre-publish audit

- No secret values in tree or history (env-var names only); no `.env`;
  `.gitignore` covers real credentials. LAN IPs only as doc mockups.
- Remote already `https`; 36 commits ahead, pushed by owner (no agent auth).
- Dirty CHANGELOG/README edits committed by owner separately.

## Beads remote (Aurora-h7p, closed)

`sync.remote` was `git+ssh` (blocked init earlier); swapped to
`https://github.com/weblings/Aurora.git` post-flip.

## Pages deploy (Aurora-fgw, closed)

- RockyRoad pattern (`build:demo` + `gh-pages -d dist`) doesn't apply:
  Aurora demo is static, no build step. First attempt was an Actions
  workflow (`demo-pages.yml`, still in tree, never ran) -- blocked by a
  billing lock on the account. Actions on public repos is free; the lock
  is account standing, not workflow cost.
- Chosen: `git subtree split --prefix web/demo -b gh-pages`, branch root
  served via "Deploy from a branch". Demo paths are all relative, so the
  apex URL works. Steady state is one line:
  `git subtree push --prefix web/demo origin gh-pages`.
- Refinement owed: raw split publishes dev files (tests, agent notes) and
  the subdir `.gitignore` unhides `build/` output -- sync with excludes
  (see lessons/architecture-process.md entry).

## Branch incident

- Checkout was found on `gh-pages` with 62 files of pure EOL churn
  (`git diff -w` empty) after the split; agent froze instead of switching
  back to `main`, owner did it. Lesson owned, not repeated.
- The hop deleted the live beads DB; rebuilt via `bd init` + `bd import`
  from the committed export (66/66), then closed fgw normally.
- Verified after: `main == origin/main`, tree clean, all session files
  present by content grep, bead state exported.

## Verification

- Demo live at the apex URL (owner-confirmed).
- Remaining: remove or revive `demo-pages.yml` once billing resolves.
