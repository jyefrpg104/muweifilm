# GitHub Pages migration plan (no production changes yet)

Current deployment settings (confirmed in GitHub Pages UI):
- Source: **Deploy from a branch**
- Branch: `main` / `(root)`
- Custom domain: `www.muweifilm.com` (DNS check successful)
- Domain DNS `www` CNAME is managed by Squarespace and points to `jyefrpg104.github.io`.

**Do not** use Cloudflare `_redirects`: the site is hosted on GitHub Pages.

## Phase 1 — Safe preparation (this branch)

- Add `scripts/build-site.sh` to generate a clean `dist/` publishing directory.
- Add `scripts/test-site.sh` to validate copied files, assets, CNAME, and Photo Quest.
- Add a build-check GitHub Actions workflow triggered by PRs. **This workflow never deploys.**
- Leave `main`, DNS, GitHub Pages Source, and the live website unchanged.

## Phase 2 — Activate GitHub Actions before moving site files

1. Wait for PR build checks to pass. Merge Phase 1 only after review.
2. Add and merge a **separate** GitHub Pages deployment workflow on `main` that publishes the builder's `dist/` through `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`; ensure `pages: write` and `id-token: write` permissions and concurrency handling.
3. From Repository → Settings → Pages, switch Source from **Deploy from a branch** to **GitHub Actions**.
4. Trigger the workflow using `workflow_dispatch` (or push a fresh commit) and verify the deployment and the live URLs: `/`, `/index.html`, `/works.html`, `/about.html`, `/contact.html`, `/site.css`, `/images/about/portrait.jpg`, and `/photo-quest/`.
5. If unsuccessful, revert the Pages Source setting to `Deploy from a branch`, branch `main`, folder `/(root)` before proceeding.

## Phase 3 — Folder migration after GitHub Actions deployment is proven

1. On a separate branch, move only the portfolio's HTML, CSS, images, and 404 to `muwei-website/`.
2. Keep `photo-quest/`, `CNAME`, and `.nojekyll` at the repository root.
3. Keep `scripts/build-site.sh` and `scripts/test-site.sh` as-is: they already support the new layout.
4. Validate `dist/` and the Pages deployment before and after merge.
5. Do not change Squarespace DNS or custom domain.

The old deployment source is never changed during Phase 1. A successful build artifact alone does not prove live deployment; test production before moving any site source files.
