#!/usr/bin/env bash
# Build the publishable static site into dist/.
# Public URL structure:
#   /                  <- muwei-website/ (Astro: src/pages + public, incl. the /lab/ hub)
#   /lab/<tool>/       <- lab/<tool>/    (static tools, copied as-is)
#   /photo-quest/, /reifo/  redirect stubs in muwei-website/public/ (old links keep working)
set -euo pipefail
cd "$(dirname "$0")/.."
export ASTRO_TELEMETRY_DISABLED=1
rm -rf dist

# Astro builds the studio site into dist/.
[[ -d node_modules/astro ]] || npm ci --no-audit --no-fund
npm run build --silent

# Every folder in lab/ is one tool, served at /lab/<tool>/.
mkdir -p dist/lab
for tool in lab/*/; do cp -a "${tool%/}" dist/lab/; done

# GitHub Pages custom domain and no-Jekyll behavior.
cp -a CNAME .nojekyll dist/

# Build stamp: /version.json tells anyone which version a URL is serving.
#   SITE_ENV      production | dev | local (default)
#   SITE_VERSION  e.g. prod-2026.11.07-1 (set by the deploy workflow)
commit="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
branch="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
cat > dist/version.json <<JSON
{
  "version": "${SITE_VERSION:-local}",
  "environment": "${SITE_ENV:-local}",
  "commit": "${commit}",
  "branch": "${branch}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

for file in index.html works.html about.html services.html contact.html 404.html site.css CNAME .nojekyll \
  lab/index.html lab/photo-quest/index.html lab/reifo/index.html lab/reifo/about/index.html \
  photo-quest/index.html reifo/index.html reifo/about/index.html version.json; do
  if [[ ! -f "dist/$file" ]]; then
    printf 'Build failed: dist/%s does not exist\n' "$file" >&2
    exit 1
  fi
done
echo 'Built dist/ from muwei-website/ and lab/'
