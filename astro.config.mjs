// Muwei Film website (Astro). Photo Quest and reifo are copied in by scripts/build-site.sh.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.muweifilm.com',
  srcDir: './muwei-website/src',
  publicDir: './muwei-website/public',
  outDir: './dist',
  // Keep public URLs unchanged: /about.html, /works.html …
  build: { format: 'file' },
  // Keep the HTML exactly as written for now (v1.2 is a no-visual-change migration).
  compressHTML: false,
});
