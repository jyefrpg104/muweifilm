#!/usr/bin/env bash
# Check the deployable site without changing the GitHub Pages settings.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f dist/index.html ]] && [[ -f dist/site.css ]] && [[ -f dist/photo-quest/index.html ]]
[[ -f dist/CNAME ]] && [[ -f dist/.nojekyll ]]
[[ -f dist/reifo/index.html && -f dist/reifo/about/index.html ]]
grep -Fxq 'www.muweifilm.com' dist/CNAME

if [[ -f muwei-website/index.html ]]; then source_dir='muwei-website'; else source_dir='.'; fi

# Ensure the builder copies files byte-for-byte (including images and HTML).
for file in index.html about.html works.html services.html contact.html 404.html site.css portrait.jpg; do
  if [[ -f "$source_dir/$file" ]]; then
    cmp "$source_dir/$file" "dist/$file"
  fi
done
if [[ -d "$source_dir/images" ]]; then
  while IFS= read -r -d '' file; do
    relative="${file#"$source_dir/"}"
    cmp "$file" "dist/$relative"
  done < <(find "$source_dir/images" -type f -print0)
fi
while IFS= read -r -d '' file; do
  cmp "$file" "dist/$file"
done < <(find photo-quest -type f -print0)

# Verify the two new routes were copied without modifying their HTML.
cmp reifo/index.html dist/reifo/index.html
cmp reifo/about/index.html dist/reifo/about/index.html

# Pages must receive the portfolio at /, not /muwei-website/.
[[ ! -d dist/muwei-website ]]
printf 'PASS: portfolio, domain, styles, images Photo Quest and reifo are preserved in dist/\n'
