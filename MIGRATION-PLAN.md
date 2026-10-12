# GitHub Pages deployment and site migration

## Confirmed architecture

- Registrar / DNS: Squarespace, `www` CNAME → `jyefrpg104.github.io`.
- Website: GitHub Pages, Source **GitHub Actions**, custom domain `www.muweifilm.com`.
- Build script `scripts/build-site.sh` supports `muwei-website/` source and the legacy root layout.
- Workflow `.github/workflows/deploy-pages.yml` uploads the generated `dist/`, deploys Pages on each push to `main`, and checks the published custom domain byte-for-byte.

## Verified checkpoints

- PR #2: `dist/` builder and tests passed without changes to production.
- PR #3: the manual deployment workflow was installed without changing website files.
- PR #5: automatic deployment workflow merged, using the legacy root layout as the first test. GitHub Pages deployed successfully; all 10 URLs passed published-content comparison (home, index, works, about, services, contact, CSS, portrait, Photo Quest homepage and icon).
- This change: moves site source to `muwei-website/` and preserves all original HTML/CSS/image SHAs and `photo-quest/` blob SHAs.

## Validation for this migration

- PR build checks must pass.
- After merge, verify the new GitHub Pages deployment `build` and `deploy` jobs both pass.
- Live check covers `/`, `/index.html`, `/works.html`, `/about.html`, `/services.html`, `/contact.html`, `/site.css`, `/images/about/portrait.jpg`, `/photo-quest/` and `/photo-quest/apple-touch-icon-v1.png`.

## Rollback

If the site fails after this migration, revert the migration commit on `main`. The build script supports both source layouts, so Actions will redeploy the old root-based website. **Keep Source = GitHub Actions** to avoid breaking the deployed root path. No Squarespace DNS change is necessary.

Always validate actual production Pages deployment separately from successful PR build checks.
