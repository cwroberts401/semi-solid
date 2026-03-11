# @semi-solid/compiler

## 0.1.3

### Patch Changes

- 638ecad: Fix infinite dev server rebuild loop caused by Tailwind v4 scanning the dist directory for content. The compiler plugin now injects `@source not` for the output directory into CSS files that import Tailwind, preventing mtime changes in dist from triggering cascading rebuilds.

## 0.1.2

### Patch Changes

- add cli init command

## 0.1.1

### Patch Changes

- add init command for blank repos
