# Grille source switch

Switches `web/graph-editor` between Grille's two sources: official npm releases
(what an Aurora release ships) and dev tarballs from GitHub Releases (dev tags
are never published to npm). A developer tool, nothing in the builds uses it.

```sh
cd web/graph-editor
npm run grille -- dev [tag]        # GitHub tarball, default newest pre-release
npm run grille -- release [ver]    # npm, default newest non-prerelease
npm run grille -- status           # source, version, resolved URL
npm run grille -- check            # exit 1 unless pinned to an exact npm version
```

- Needs `gh` (authenticated) for `dev` and for the default `release` lookup.
- Use the release tarball, not a `github:` spec: Grille builds in `prepare`,
  and the editor's `.npmrc` sets `ignore-scripts=true`.
- Run `check` before an Aurora release so a dev pin cannot ship.
