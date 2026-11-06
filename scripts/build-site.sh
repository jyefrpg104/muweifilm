#!/usr/bin/env bash
# Build the publishable static site into dist/.
# Public URL structure:
#   /              <- muwei-website/
#   /photo-quest/  <- photo-quest/
#   /reifo/        <- reifo/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist

cp -a muwei-website/. dist/
cp -a photo-quest dist/
cp -a reifo dist/

# GitHub Pages custom domain and no-Jekyll behavior.
cp -a CNAME .nojekyll dist/

for file in index.html works.html about.html services.html contact.html 404.html site.css CNAME .nojekyll \
  photo-quest/index.html reifo/index.html reifo/about/index.html; do
  if [[ ! -f "dist/$file" ]]; then
    printf 'Build failed: dist/%s does not exist\n' "$file" >&2
    exit 1
  fi
done
echo 'Built dist/ from muwei-website/, photo-quest/ and reifo/'
