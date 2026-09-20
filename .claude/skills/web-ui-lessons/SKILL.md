---
name: web-ui-lessons
description: WebUI design-process gotchas — check before building screens/components or changing the WebUI plan docs.
allowed-tools: Read
---

# WebUI lessons

Before building WebUI screens or components, or editing
`Analysis/WebUI/` plan docs, grep the query-coherent files (`planning`,
`components`, `webui-testing`, `navigation-flow`, `layout-css` in
`Analysis/lessons/`).

## How to use this skill

1. Grep `Tags:`/`Applies-when:` across those files for the task at hand —
   read only matching entries in full, never whole files.
2. Verify "existing component" claims against real source, validate
   interaction models against what other build steps actually supply,
   and keep plan-doc sections in sync when building out of order.
3. File new WebUI findings here per `Analysis/lessons/README.md` —
   new entries require `Tags:` and `Applies-when:` lines.
