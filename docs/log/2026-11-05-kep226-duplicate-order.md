# A duplicated effect is last in Custom straight away

Id: kep226-duplicate-order

`Aurora-kep2.26`: the duplicate route did not add the copy to `effectOrder`, so
it landed by the unordered rule instead of last in Custom.

- Fix: after the copy is written, the route saves the full display order with
  the copy moved to the end (`EffectsRoutes.cpp`).
- Test: the Duplicate case checks the last two saved ids. `[Apply]` passes.

- Lessons: none.
