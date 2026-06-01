# Release Guide

Releases are automated via GitHub Actions. Pushing a version tag triggers a Windows build and publishes a GitHub Release with the installer attached — no manual steps on the GitHub website required.

## Steps

### 1. Bump the version (optional but recommended)

Edit `package.json` and update the `version` field:

```json
"version": "2.0.1"
```

Then commit the change:

```bash
git add package.json
git commit -m "chore: bump version to 2.0.1"
git push
```

### 2. Tag and push

```bash
git tag v2.0.1
git push origin v2.0.1
```

That's all. GitHub Actions will automatically:

1. Spin up a Windows runner
2. Install dependencies via `npm ci`
3. Build the Windows installer via `npm run dist`
4. Create a GitHub Release named `v2.0.1`
5. Auto-generate release notes from commits since the last tag
6. Upload `Packing Recorder Setup X.X.X.exe` as the downloadable asset

## Monitor the build

Track progress at:

```
https://github.com/JasonAldeo/packing-recorder/actions
```

## Notes

- Tags must match the pattern `v*` (e.g. `v2.0.1`, `v3.0.0`) to trigger the workflow.
- No secrets setup is needed — the workflow uses the built-in `GITHUB_TOKEN`.
- The workflow file lives at `.github/workflows/release.yml`.
