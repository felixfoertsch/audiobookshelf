# Audiobookshelf Modern UI

Standalone Modern UI for stock [Audiobookshelf](https://github.com/advplyr/audiobookshelf) 2.37.1. Derived from Audiobookshelf by advplyr and contributors; original GPL-3.0 license and history retained. Backend and Classic UI are not included.

```sh
bun install --frozen-lockfile
bun dev
```

Production: `docker build -t audiobookshelf-modern-ui .`, then run port 8080 with `ABS_UPSTREAM=https://audiobookshelf.felixfoertsch.de` and `PSB_UPSTREAM=http://podcast-sponsorblock:3000`. Native authentication, catalog and playback belong to ABS. Optional analysis/feed augmentation uses same-origin `/psb`.
