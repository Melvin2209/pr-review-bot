#!/usr/bin/env bash
# Usage: scripts/release.sh <patch|minor|major|x.y.z>
# Bumps the version, rebuilds dist/, commits, tags and pushes. The Release workflow does the rest.
set -euo pipefail

BUMP="${1:?usage: scripts/release.sh <patch|minor|major|x.y.z>}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean." >&2
  exit 1
fi
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Releases are cut from main." >&2
  exit 1
fi

npm ci
npm run all

VERSION="$(npm version "$BUMP" --no-git-tag-version)"   # e.g. v1.2.0
if ! grep -q "^## \[${VERSION#v}\]" CHANGELOG.md; then
  echo "CHANGELOG.md has no '## [${VERSION#v}]' section. Add one, then re-run." >&2
  git checkout package.json package-lock.json
  exit 1
fi

npm run build
git add package.json package-lock.json dist CHANGELOG.md
git commit -m "Release $VERSION"
git tag -a "$VERSION" -m "$VERSION"
git push origin main "$VERSION"
echo "Pushed $VERSION — the Release workflow will publish it and move the ${VERSION%%.*} tag."
