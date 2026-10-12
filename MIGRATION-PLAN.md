# Zero-downtime GitHub Pages migration checklist

Current original production setting: Settings → Pages → Deploy from a branch → main /(root).
Domain: www.muweifilm.com; registrar/DNS: Squarespace; DNS CNAME www → jyefrpg104.github.io.

## Stage 1: PR #2 (completed)
- Add build script supporting the original root layout and future `muwei-website/` source.
- Add site integrity tests, PR checks only.
- Site root files unchanged.

## Stage 2: PR #3 (deployment workflow)
- Add `.github/workflows/deploy-pages.yml` with `workflow_dispatch` ONLY.
- Review workflow checks and merge PR #3 while the website still uses root files.
- In GitHub → repository Settings → Pages, choose Source: **GitHub Actions**.
- In GitHub → Actions, manually run **Deploy website to GitHub Pages** on `main`.
- Verify production home, /works.html, /about.html, /services.html, /contact.html, /site.css, /images/about/portrait.jpg and /photo-quest/.
- Do not merge the folder-migration PR unless the GitHub Actions deployment succeeds and the site is visibly correct.

## Stage 3: folder migration PR #4 (only after Stage 2 succeeds)
- Move all portfolio source HTML/CSS/images to `muwei-website/` preserving the blobs.
- Keep `photo-quest/` unchanged and `CNAME` + `.nojekyll` at the repository root.
- PR build must pass, verifying `dist/` contains the same pages at public root.
- Merge only after Stage 2 success.
- Since the deployment workflow is manual-only, immediately run it again on `main`, then verify the live URLs.
- If desired, after this is stable, enable deploy on every push to `main`.

## If there is a deployment failure
- Before Stage 3 merge, simply switch Source back to **Deploy from a branch → main /(root)** to recover the previous production mode.
- After Stage 3 merge, revert the migration commit and rerun the Action; do **not** switch back to root publishing while `index.html` is absent from `main`.
- Never change Squarespace DNS as part of this migration.

The build passing is not the same as production working. Validate the GitHub Pages deployment and browser-visible website separately at both stages.
