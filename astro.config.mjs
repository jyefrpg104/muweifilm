// Muwei Film website (Astro). Photo Quest and reifo are copied in by scripts/build-site.sh.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.muweifilm.com',
  srcDir: './muwei-website/src',
  publicDir: './muwei-website/public',
  outDir: './dist',
  // 'preserve': about.astro → /about.html, lab/index.astro → /lab/index.html
  build: { format: 'preserve' },
  // Keep the HTML exactly as written for now (v1.2 is a no-visual-change migration).
  compressHTML: false,
});
