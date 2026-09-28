# Shakil’s portfolio

Published at https://prxkc.github.io/. The repository root contains the production build; editable Vite source lives in `site/`. Previous portfolio files remain available, and Git history preserves the previous homepage.

## Update

Use Node.js 22.12 or newer. Run `npm --prefix site ci`, then `npm --prefix site run build`. Copy the contents of `site/dist/` to the repository root and commit the source and rebuilt files together. Keep `.nojekyll`.

GitHub Pages should publish from the `main` branch, `/ (root)`. No redirect or domain change is needed.

Typography: Crimson Pro, licensed under SIL OFL 1.1; see `licenses/Crimson-Pro-OFL.txt`.
