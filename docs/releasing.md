# Releasing

Publishing is automated — a version bump does the rest.

```bash
npm run release:patch   # 0.1.5 → 0.1.6   (bug fixes)
npm run release:minor   # 0.1.5 → 0.2.0   (new features)
npm run release:major   # 0.1.5 → 1.0.0   (breaking changes)
```

Each runs `npm version`:

1. `preversion` — typecheck + unit tests (`npm run typecheck && npm test`). A
   failure stops before anything is bumped, tagged or pushed.
2. Bumps `package.json` and creates a `vX.Y.Z` commit and tag.
3. `postversion` — pushes with tags and opens a GitHub Release with generated
   notes.

Publishing the Release triggers **Publish to npm**
(`.github/workflows/publish.yml`):

1. Runs the **CI** workflow (`ci.yml`: typecheck, unit tests, build, Playwright).
2. Verifies the tag matches `package.json`, typechecks, builds.
3. `npm publish` via npm **OIDC trusted publishing** (no `NPM_TOKEN`;
   provenance generated automatically). `prepublishOnly` runs typecheck, tests
   and build again.

**Dry run:** Actions → Publish to npm → Run workflow. `dry_run` defaults to on
and runs CI then `npm publish --dry-run`. With it off the run publishes for
real and must be dispatched from the matching `vX.Y.Z` tag.

Work on a branch and merge to `main` before releasing; the release commit lands
on your current branch. To publish by hand, `npm publish` runs `prepublishOnly`
first.
