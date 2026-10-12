#!/usr/bin/env bash
# Build the static site without changing its public URL structure.
# Works both before and after moving the portfolio into muwei-website/.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist

if [[ -f muwei-website/index.html ]]; then
  # After migration: portfolio source lives in its own directory.
  cp -a muwei-website/. dist/
else
  # Current production layout: site files live at the repository root.
  for file in index.html about.html works.html services.html contact.html 404.html site.css portrait.jpg; do
    if [[ -f "$file" ]]; then
      cp -a "$file" dist/
    fi
  done
  if [[ -d images ]]; then cp -a images dist/; fi
fi

# Preserve GitHub Pages custom domain and no-Jekyll behavior.
for file in CNAME .nojekyll; do
  if [[ -f "$file" ]]; then cp -a "$file" dist/; fi
done

# Keep Photo Quest at the original public path: /photo-quest/.
if [[ -d photo-quest ]]; then cp -a photo-quest dist/; fi

for file in index.html works.html about.html services.html contact.html site.css CNAME photo-quest/index.html; do
  if [[ ! -f "dist/$file" ]]; then
    printf 'Build failed: dist/%s does not exist\n' "$file" >&2
    exit 1
  fi
done
echo "Built dist/ from $( [[ -d muwei-website ]] && echo muwei-website/ || echo repository-root/ ) plus photo-quest/"
