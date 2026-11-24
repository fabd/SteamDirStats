#!/usr/bin/env bash
# Set the version in every file that carries it, and commit the change.
#
#   tools/bump.sh 1.1.0
#
# Run tools/release.sh afterwards to build and publish that version.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: tools/bump.sh <version>   (eg. tools/bump.sh 1.1.0)" >&2
  exit 1
fi

VERSION="${1#v}"
cd "$(dirname "$0")/.."

fail() {
  echo "error: $*" >&2
  exit 1
}

case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) fail "'$VERSION' is not a version like 1.1.0" ;;
esac

[ -z "$(git status --porcelain)" ] || fail "uncommitted changes in the working tree"

CURRENT=$(node -p "require('./package.json').version")
[ "$CURRENT" != "$VERSION" ] || fail "the version already is $VERSION"

echo "Current version: $CURRENT"
read -r -p "Bump to $VERSION? [y/N] " REPLY
case "$REPLY" in
  y | Y | yes | YES) ;;
  *) echo "Aborted."; exit 1 ;;
esac

# package.json and tauri.conf.json both carry "version" in their first object.
node -e '
  const fs = require("fs");
  const version = process.argv[1];

  for (const file of ["package.json", "src-tauri/tauri.conf.json"]) {
    const text = fs.readFileSync(file, "utf8");
    const next = text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);

    if (next === text) {
      console.error(`error: no version field in ${file}`);
      process.exit(1);
    }

    fs.writeFileSync(file, next);
  }
' "$VERSION"

# In Cargo.toml only the [package] version is ours: it is the first one.
sed -i "0,/^version = \"/s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

# Keep the lockfile in step, so a build does not have to rewrite it.
sed -i "/^name = \"steamdirstats\"$/{n;s/^version = \".*\"/version = \"$VERSION\"/}" src-tauri/Cargo.lock

# The landing page links the exe of the release it is built for.
LINK="/download/SteamDirStats-$VERSION.exe"
grep -q "/download/SteamDirStats-[0-9.]*\.exe" docs/index.html ||
  fail "no download link in docs/index.html"
sed -i "s|/download/SteamDirStats-[0-9.]*\.exe|$LINK|" docs/index.html

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock docs/index.html
git commit -q -m "Bump version to $VERSION"

echo "==> Committed:"
git show --stat --oneline HEAD
