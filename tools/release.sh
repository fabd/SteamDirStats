#!/usr/bin/env bash
# Build SteamDirStats and publish it as a draft GitHub release.
#
#   tools/release.sh 1.0.0
#
# Needs the GitHub CLI (`gh auth login` once). The version must match
# package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json and the
# download link on the landing page. tools/bump.sh sets all of them.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: tools/release.sh <version>   (eg. tools/release.sh 1.0.0)" >&2
  exit 1
fi

VERSION="${1#v}"
TAG="v$VERSION"
cd "$(dirname "$0")/.."

fail() {
  echo "error: $*" >&2
  exit 1
}

# The version must match every file that carries it.
PKG_VERSION=$(node -p "require('./package.json').version")
CONF_VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
CARGO_VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n 1)
PAGE_VERSION=$(sed -n 's|.*/download/SteamDirStats-\(.*\)\.exe.*|\1|p' docs/index.html | head -n 1)

[ "$PKG_VERSION" = "$VERSION" ] || fail "package.json is $PKG_VERSION, not $VERSION"
[ "$CONF_VERSION" = "$VERSION" ] || fail "tauri.conf.json is $CONF_VERSION, not $VERSION"
[ "$CARGO_VERSION" = "$VERSION" ] || fail "Cargo.toml is $CARGO_VERSION, not $VERSION"
[ "$PAGE_VERSION" = "$VERSION" ] || fail "the docs/index.html download link is ${PAGE_VERSION:-missing}, not $VERSION"

# Release only committed, pushed code, under a tag not used yet.
command -v gh > /dev/null || fail "the GitHub CLI (gh) is not installed"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes in the working tree"
git fetch --quiet origin
git merge-base --is-ancestor HEAD "@{upstream}" || fail "HEAD is not pushed to $(git rev-parse --abbrev-ref '@{upstream}')"
git rev-parse -q --verify "refs/tags/$TAG" > /dev/null && fail "tag $TAG already exists"

echo "==> Building $TAG"
npx tauri build

EXE="src-tauri/target/release/SteamDirStats-$VERSION.exe"
cp src-tauri/target/release/SteamDirStats.exe "$EXE"

echo "==> Tagging $TAG"
git tag -a "$TAG" -m "SteamDirStats $VERSION"
git push origin "$TAG"

echo "==> Creating draft release"
gh release create "$TAG" "$EXE" \
  --title "SteamDirStats $VERSION" \
  --generate-notes \
  --draft

echo "==> Done. Review the draft and publish it on GitHub:"
gh release view "$TAG" --json url --jq .url
