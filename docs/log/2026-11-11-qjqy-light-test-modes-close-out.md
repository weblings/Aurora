# Light test modes close-out

Id: qjqy-light-test-modes-close-out

`Aurora-qjqy`. Children `.1` to `.3` confirmed closed in `bd show`. Acceptance: [[graph-editor-cleanup]] and `adapters/mcp/README.md` describe Once and Live, and the aurora MCP server instructions say a test lasts 15 s by default with `mode` live to hold it. The plan doc status line now says the light test modes are built. Follows [[qjqy3-test-split-button]].
- Pre-PR sweep on the branch head: ctest 120 (app build) and 496 (`cmake -S core`), Vitest 132, tsc, Vite build, `web/ui/shell.test.mjs`; the nine graph-editor browser checks not run in [[qjqy3-test-split-button]] (add-menu, add-node, back-link, context-menus, control-count, converter, delete, port-types, save-as-new).
- control-count failed at 11 against a ceiling of 10: `.3` added the split button's caret (`Test mode`) as its own button and did not run this check. Ceilings now video 11 (the mock's target) and audio 10, each the measured count.
- Lessons: none.
