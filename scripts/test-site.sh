#!/usr/bin/env bash
# Verify dist/ is a byte-for-byte copy of the source folders, with the right root layout.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f dist/CNAME && -f dist/.nojekyll ]]
grep -Fxq 'www.muweifilm.com' dist/CNAME

compare_tree() {
  local source_dir="$1" target_dir="$2"
  while IFS= read -r -d '' file; do
    cmp "$file" "$target_dir/${file#"$source_dir/"}"
  done < <(find "$source_dir" -type f -print0)
}

compare_tree muwei-website dist
compare_tree photo-quest dist/photo-quest
compare_tree reifo dist/reifo

# Pages must receive the portfolio at /, not /muwei-website/.
[[ ! -d dist/muwei-website ]]
printf 'PASS: portfolio, domain, Photo Quest and reifo are preserved in dist/\n'
