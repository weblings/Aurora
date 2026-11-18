# Seeded palette anchor pick is portable across platforms

Id: kuee-portable-anchor-pick

`Aurora-kuee`. `palette.randomAnchor` now picks through a shared `pickIndex` instead of `std::uniform_int_distribution`, whose mapping differs between MSVC, libstdc++ and libc++. The same seed gives the same anchor on Windows, Mac, Linux and a future WASM build. Closed after Mac and Linux CI passed.

## Verification
- Mac and Linux CI passed on the branch (reported by the owner).

## Lessons
- none
