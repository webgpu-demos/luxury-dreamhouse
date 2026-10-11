#!/bin/sh
# Builds the site and publishes it to the gh-pages branch of origin, which GitHub Pages serves at
# https://webgpu-demos.github.io/luxury-dreamhouse/. The branch holds only the latest build (force-pushed).
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "deployed $(du -sh . | cut -f1) to gh-pages"
