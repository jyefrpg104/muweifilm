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

# Every Astro page keeps its path (about.astro -> about.html, lab/index.astro -> lab/index.html) and <title>.
while IFS= read -r -d '' page; do
  rel="${page#muwei-website/src/pages/}"
  built="dist/${rel%.astro}.html"
  [[ -f "$built" ]] || { echo "Missing $built" >&2; exit 1; }
  title="$(grep -o '<title>[^<]*</title>' "$page" | head -1)"
  grep -Fq "$title" "$built" || { echo "Title changed in $built" >&2; exit 1; }
done < <(find muwei-website/src/pages -name '*.astro' -print0)

# Share preview and social image stay in place.
grep -Fq 'property="og:image" content="https://www.muweifilm.com/images/og.jpg"' dist/index.html
[[ -f dist/images/og.jpg ]]

# Static files are copied byte-for-byte.
compare_tree muwei-website/public dist
for tool in lab/*/; do compare_tree "${tool%/}" "dist/${tool%/}"; done

# Lab hub lists every tool in the data file, and links to it.
node -e '
  const fs=require("fs"); const html=fs.readFileSync("dist/lab/index.html","utf8");
  for (const t of require("./muwei-website/src/data/lab-tools.json")) {
    if (!fs.existsSync("lab/"+t.slug+"/index.html")) throw new Error("lab/"+t.slug+"/ missing for "+t.name);
    if (!html.includes(`href="${t.href}"`)) throw new Error("Lab hub does not link "+t.href);
  }'

# Main nav links to the lab on every studio page.
for page in index works about services contact; do grep -Fq '>實驗室</a>' "dist/$page.html"; done

# Old URLs redirect to the lab, keeping ?query and #hash.
for old in photo-quest reifo reifo/about; do
  grep -Fq "location.replace('/lab/$old/' + location.search + location.hash)" "dist/$old/index.html"
done

# Pages must be served at /, not /muwei-website/.
[[ ! -d dist/muwei-website ]]
printf 'PASS: pages, titles, domain, static files, lab tools, lab hub and redirects verified in dist/\n'
