#!/usr/bin/env bash
# Verify published GitHub Pages content and paths after a production deployment.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_URL="${SITE_BASE_URL:-https://www.muweifilm.com}"
BUST="${GITHUB_SHA:-production-check}"
paths=(
  "/|dist/index.html"
  "/index.html|dist/index.html"
  "/works.html|dist/works.html"
  "/about.html|dist/about.html"
  "/services.html|dist/services.html"
  "/contact.html|dist/contact.html"
  "/site.css|dist/site.css"
  "/images/about/portrait.jpg|dist/images/about/portrait.jpg"
  "/images/og.jpg|dist/images/og.jpg"
  "/reifo/|dist/reifo/index.html"
  "/reifo/about/|dist/reifo/about/index.html"
  "/photo-quest/|dist/photo-quest/index.html"
  "/photo-quest/apple-touch-icon-v1.png|dist/photo-quest/apple-touch-icon-v1.png"
)
for item in "${paths[@]}"; do
  route="${item%%|*}"
  file="${item#*|}"
  temp="$(mktemp)"
  passed=false
  for attempt in $(seq 1 18); do
    if curl --fail --location --silent --show-error --connect-timeout 10 --max-time 25 --header 'Cache-Control: no-cache' "${BASE_URL}${route}?sha=${BUST}" --output "$temp"; then
      if cmp -s "$file" "$temp"; then
        passed=true
        break
      fi
      echo "Content mismatch on ${route} (attempt ${attempt})"
    else
      echo "HTTP request failed for ${route} (attempt ${attempt})"
    fi
    sleep 10
  done
  rm -f "$temp"
  if [[ "$passed" != true ]]; then
    echo "FAIL: public URL ${BASE_URL}${route} is not serving expected file ${file}" >&2
    exit 1
  fi
  echo "PASS: ${BASE_URL}${route}"
done
if [[ -n "${GITHUB_SHA:-}" ]]; then
  for attempt in $(seq 1 18); do
    live="$(curl --fail --location --silent --show-error --header 'Cache-Control: no-cache' "${BASE_URL}/version.json?sha=${BUST}" || true)"
    if grep -q "\"commit\": \"${GITHUB_SHA}\"" <<<"$live"; then
      echo "PASS: ${BASE_URL}/version.json reports commit ${GITHUB_SHA}"; break
    fi
    echo "version.json not yet at ${GITHUB_SHA} (attempt ${attempt})"; sleep 10
    [[ "$attempt" == 18 ]] && { echo "FAIL: live version.json does not report ${GITHUB_SHA}" >&2; exit 1; }
  done
fi
echo 'Live website URL and byte-level deployment verification succeeded.'
