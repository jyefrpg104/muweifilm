#!/usr/bin/env bash
# Verify dist/: every page built, static files byte-for-byte, root layout, domain.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f dist/CNAME && -f dist/.nojekyll && -f dist/version.json ]]
grep -Fxq 'www.muweifilm.com' dist/CNAME

compare_tree() {
  local source_dir="$1" target_dir="$2"
  while IFS= read -r -d '' file; do
    cmp "$file" "$target_dir/${file#"$source_dir/"}"
  done < <(find "$source_dir" -type f -print0)
}

# Every Astro page becomes /<name>.html and keeps its <title>.
for page in muwei-website/src/pages/*.astro; do
  name="$(basename "$page" .astro)"
  built="dist/$name.html"
  [[ -f "$built" ]] || { echo "Missing $built" >&2; exit 1; }
  title="$(grep -o '<title>[^<]*</title>' "$page" | head -1)"
  grep -Fq "$title" "$built" || { echo "Title changed in $built" >&2; exit 1; }
done

# Share preview and social image stay in place.
grep -Fq 'property="og:image" content="https://www.muweifilm.com/images/og.jpg"' dist/index.html
[[ -f dist/images/og.jpg ]]

# Static files are copied byte-for-byte.
compare_tree muwei-website/public dist
compare_tree photo-quest dist/photo-quest
compare_tree reifo dist/reifo

# Pages must be served at /, not /muwei-website/.
[[ ! -d dist/muwei-website ]]
printf 'PASS: pages, titles, domain, static files, Photo Quest and reifo verified in dist/\n'
