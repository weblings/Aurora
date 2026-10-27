# 5ipy.39: core refactor for v1 (Aurora-5ipy.39)

Id: v1-core-refactor

Plan B3a in [[api-v1-plan]].

## Shipped

- `registerPublicApiRoutes` entry point in core, called from the Windows, Mac and Linux mains, so those files
  change once for all of Lane B.
- One `ReloadCoalescer` per host, shared by the settings routes, the effects routes and the v1 routes. `PUT
  /api/effects` now coalesces its reload instead of running it alone.
- `buildStateJson` split into a `StateSnapshot` struct plus serializers.
- The events loop takes payload builders, so v1 events can send the v1 shape. Internal route output is unchanged.
- Green CI on Windows, Mac and Linux with `lane_a_gate.py` as the launch check.

- Lessons: none
