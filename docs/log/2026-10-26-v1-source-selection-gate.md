# 5ipy.44: source selection gate missed, B8 moved to C1 (Aurora-5ipy.44)

Id: v1-source-selection-gate

Plan B8 in [[api-v1-plan]].

## Paused

- Gate checked when B4 landed (42141c4): not taken.
- A8 (Aurora-5ipy.27) has code but Mac and X11 builds, drift repro and replug survival are unverified.
- Monitor-rebuild beads Aurora-ecl5, Aurora-h06o and Aurora-9fn3 are open.
- The bead is now plan C1 (`apiVersion` 1.1, same scope), labelled `v1.1` and dependent on B6. B6 and B7b proceed without it.

## Resumes when

- A8 verified on all three platforms and the three rebuild beads closed, then the freeze (Aurora-5ipy.9) has landed.
