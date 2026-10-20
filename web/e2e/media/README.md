# Local E2E media

## Opt-in real subscriptions

Run `bun web/e2e/real-media/download.ts` from repository root; requires installed backend `xml2js` and `ffprobe`. Restart local fixture only after integration owner hands off existing preview. Script resolves Apple lookup to actual publisher RSS, saves RSS/Apple metadata, covers and one episode per requested subscription. LibriVox RSS supplies complete seven-chapter book; Internet Archive metadata verifies 83,894,784 bytes total before download, below explicit 250 MB book bound. All fetched material and generated manifest stay under ignored `real/`; never commit or redistribute podcast material. No account, production server, ABS database or deployment involved. Tests never fetch network.

Sources: [LOW](https://podcasts.apple.com/gb/podcast/low/id6809689703), [The End Of The World with Josh Clark](https://podcasts.apple.com/fr/podcast/the-end-of-the-world-with-josh-clark/id1437682381), [Der Antichrist](https://librivox.org/der-antichrist-by-friedrich-nietzsche/). Exact URLs, feed enclosures, SHA-256, sizes and measured `ffprobe` durations reside in ignored `real/manifest.json`. LibriVox recordings are public domain in USA; copyright status elsewhere requires local verification, not worldwide legal advice.

Downloader allows vetted public HTTPS hosts only, validates each redirect, limits redirects to 10, each response to 180 seconds, RSS to 5 MB, covers to 5 MB, audio to 100 MB. Unknown redirect hosts fail closed. Existing MP3 cache files reused only after manifest schema, exact byte size and SHA-256 validation. `ffprobe` executable resolves before fetching; each probe killed after 15 seconds. Manifest publishes atomically only after every track succeeds. Remove affected local MP3 before explicit refresh.

Fixture adds persisted offline subscription snapshots at startup (not production subscriptions) alongside original six books/six shows. Models `Podcast.metadata.feedUrl`, episode `enclosure`, downloaded `audioFile`, `audioTrack`, book audio files/tracks/chapters, absolute book offsets and direct-play sessions. Backend references: `server/controllers/PodcastController.js` feed import (`feeds`, folder, `autoDownloadEpisodes`), `server/managers/PodcastManager.js#createPodcastsFromFeedUrls`, `server/utils/podcastUtils.js` RSS extraction. This development adapter does not run ABS subscription scheduler, poll feeds, import whole feeds or implement download queue. Membership persists through ignored manifest; playback sessions remain in memory. Production behavior still needs real-server integration tests. Complete seven-chapter book allows full multitrack testing. Single loopback Node HTTP bridge serves both clients, streaming responses with backpressure. Explicit `CLASSIC_COMPARE=1` enables existing root backend Socket.IO installation (currently 4.7.4); absent backend packages fail with actionable message. Default portable web-only fixture never loads this optional module and does not emulate socket protocol. No dependency or lockfile changes. Enabled comparison supplies real websocket endpoints `/socket.io`, `/classic/socket.io`, `/abs/socket.io`. Each requires exact fixture token on `auth` before native `init`; progress/bookmark updates emit user-scoped `user_updated`. Other socket request events remain unsupported, not fabricated. Classic login, library home, item and account rendered in standalone Chromium without page errors or HTTP failures. Native HTTP adapter covers bootstrap, libraries, shelves/filter data, authors/narrators/series, collections/playlists, per-user progress/bookmarks, tasks and cached podcast feed/subscription requests. Membership removal/re-add is in-memory, restored from local manifest on restart; scheduler and live downloads stay unsupported. Run network-free checks from repository root: `bun web/e2e/real-media/check-fixture.ts`. Classic static mount uses local `client/dist`, HTML fallback only for navigation; missing assets/API remain 404.

## Portable synthetic breadth

Visible text, transcripts, SVG covers, and generated tones are original fixture material. Native speech output remains local-only; no redistribution rights asserted. No real library data, remote assets, or cloud TTS.

`tones/*.wav` are deterministic synthetic PCM tone fallbacks (not voice narration). `field-notes-episode-01.wav` and `glass-orchard-chapter-01.wav` match narration WAV durations exactly. `local/*.aiff` and `local/*.wav` are generated locally with macOS `say` and `afconvert`; they remain ignored because System Voices redistribution terms are not established. Only first Field Notes episode and first book have playable map entries; other records are intentionally unavailable (duration zero), and requests should return 404. Local preview uses ignored native narration when present, otherwise its checked-in tone fallback. Transcripts are original: `transcripts/field-notes-episode-01.txt` and `transcripts/glass-orchard-chapter-01.txt`.

Regenerate portable tones: `python3 web/e2e/media/.generate.py` from repository root. Regenerate local speech on macOS (not required for CI):

```sh
mkdir -p web/e2e/media/local
/usr/bin/say -v Alex -r 180 -f web/e2e/media/transcripts/field-notes-episode-01.txt -o web/e2e/media/local/field-notes-episode-01.aiff
/usr/bin/afconvert -f WAVE -d LEI16@8000 -c 1 web/e2e/media/local/field-notes-episode-01.aiff web/e2e/media/local/field-notes-episode-01.wav
/usr/bin/say -v Alex -r 180 -f web/e2e/media/transcripts/glass-orchard-chapter-01.txt -o web/e2e/media/local/glass-orchard-chapter-01.aiff
/usr/bin/afconvert -f WAVE -d LEI16@8000 -c 1 web/e2e/media/local/glass-orchard-chapter-01.aiff web/e2e/media/local/glass-orchard-chapter-01.wav
```

Voice/runtime changes can alter durations. Re-measure and update `data.ts` and tone lengths together; `bun run test` checks frame-derived duration.

Measured 2026-10-20 using `afinfo` and Python WAV frames/sample-rate: Field Notes 12.35025 s; Glass Orchard 13.883375 s. Metadata, local audio, and corresponding tone fallbacks use matching durations.
