# The link monitor was checked on a real bridge and its banner copy reworded

Id: qqcn-link-monitor-real-bridge

`Aurora-qqcn`, follow-up to [[lt66-output-link-monitor]].

## State

- Release build on real lights, bridge unplugged by the owner mid-stream.
- Both rows showed, "Can't reach your lights" and "Your lights stopped streaming, reconnecting",
  and the logic behaved correctly.
- The wording broke banner conventions: full sentences, a next step, "Aurora" as the actor.
  The three `OutputLinkMonitor` strings were reworded, including the Busy row.
- The rewording was not built or run. The strings are only read through the constants.

## Open

- Not exercised on hardware: the Busy row with Hue Sync on another area, and recovery after a
  power cut. The owner closed the bead without them.

- Lessons: none.
