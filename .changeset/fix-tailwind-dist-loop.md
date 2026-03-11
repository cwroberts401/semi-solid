---
"@semi-solid/compiler": patch
---

Fix infinite dev server rebuild loop caused by Tailwind v4 scanning the dist directory for content. The compiler plugin now injects `@source not` for the output directory into CSS files that import Tailwind, preventing mtime changes in dist from triggering cascading rebuilds.
