# Releasing

Publishing is fully automated — a version bump does the rest.

```bash
npm run release:patch   # 0.1.5 → 0.1.6   (bug fixes)
npm run release:minor   # 0.1.5 → 0.2.0   (new features)
npm run release:major   # 0.1.5 → 1.0.0   (breaking changes)
```

Each runs `npm version`, which typechecks (`preversion`), bumps `package.json`,
creates a `vX.Y.Z` tag, pushes, and opens a GitHub Release with generated notes
(`postversion`). Publishing the Release triggers the **Publish to npm** workflow
(`.github/workflows/publish.yml`): typecheck, build, verify the tag matches
`package.json`, then `npm publish` via npm **OIDC trusted publishing** (no
`NPM_TOKEN`; provenance generated automatically).

Work on a branch and merge to `main` before releasing; the release commit lands
on your current branch. To publish by hand, `npm publish` runs `prepublishOnly`
(typecheck + test + build) first.
