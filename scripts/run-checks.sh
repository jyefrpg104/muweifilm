#!/usr/bin/env bash
# One entry point for every pre-release check.
# Used by: local development, PR checks (dev) and the production deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

echo '== Photo Quest unit tests'
for test_file in tests/*.test.cjs; do
  node "$test_file"
done

echo '== Build dist/'
bash scripts/build-site.sh

echo '== Verify dist/'
bash scripts/test-site.sh

echo 'PASS: all checks succeeded'
