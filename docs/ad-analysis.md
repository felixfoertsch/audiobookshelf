# Experimental inserted-audio candidates

## Fork container image

Fork development uses `main` at <https://github.com/felixfoertsch/audiobookshelf>. Every push to `main`, including documentation-only changes, builds and publishes `ghcr.io/felixfoertsch/audiobookshelf:main` for `linux/amd64` and `linux/arm64`. Each build also publishes `:sha-<full-commit-SHA>` for commit-specific pulls. The `Publish fork image` workflow can also run manually on `main`; other branches and pull requests cannot publish. Newer runs cancel older runs on the same branch.

```fish
docker pull ghcr.io/felixfoertsch/audiobookshelf:main
```

For a new installation, use the repository's `docker-compose.yml` example and replace only its `image:` value with `ghcr.io/felixfoertsch/audiobookshelf:main` (or a commit-specific tag). Keep its `13378:80` port mapping and persistent `/config`, `/metadata`, `/audiobooks`, and `/podcasts` mounts; adjust host paths for your installation. Back up existing config/metadata before choosing to run experimental builds against existing data.

Publication uses GitHub's built-in `GITHUB_TOKEN` with package-write permission; no Docker Hub credentials, PAT, or repository-secret registration required. GitHub initially creates container packages as private; the package owner must set package visibility to public for anonymous pulls, even when the fork is public. CI checks FFmpeg and full-duration Chromaprint in the built amd64 runtime before multi-platform publication. This checks runtime compatibility, not inserted-audio detection accuracy. Image publication does not update or restart any deployed ABS service; pulling and deploying remain explicit operator actions.

## Optional analysis VPN proxy

Set server environment `AD_ANALYSIS_PROXY_URL=http://gluetun:8888` only on the new fork experiment. Leave existing stable production unchanged: exactly two ABS instances, stable plus one experiment, not a third instance. Use separate experiment config/metadata and media destinations; never share writable production state. Shared Gluetun infrastructure belongs to host provisioning, not this repository. Connect only Gluetun and the experiment to dedicated `vpn-egress` Docker bridge; do not publish proxy port or expose its control API. No keys or credentials belong in ABS configuration. Mullvad WireGuard credentials and live VPN tests remain pending.

When unset, analysis retains direct SSRF-filtered transport. When set, all analysis catalog, RSS and comparison enclosure requests use HTTP CONNECT through this endpoint. Ordinary ABS downloads and playback remain direct. Only an HTTP proxy origin is accepted: no credentials, non-root path, query or fragment. Invalid configuration, refusal, timeout, TLS failure or tunnel loss fails analysis requests without direct fallback; catalog attempts record `invalid_analysis_proxy` or `proxy_failed_or_blocked` (timeouts use `request_timeout`). Evidence records `route: direct` or `route: vpn_proxy` without addresses or URLs. `vpn_proxy` means configured transport, not proof of VPN location or health. Identical fingerprints remain insufficient diversity.

The application resolves destination hostnames through the host's native trusted DNS resolver, rejects the entire answer set if any address is forbidden, and pins a validated literal IP in each CONNECT target. Proxy never resolves the original destination hostname. HTTPS still verifies the original hostname/certificate and sends its original SNI; HTTP Host stays original. Redirects repeat validation and consent checks under one absolute request deadline. DNS is local, not promised private or VPN-routed. This MVP deliberately does not implement VPN DNS or control Gluetun.

Gluetun's firewall setup precedes proxy startup, but the proxy can remain listening during VPN restarts; a listening proxy or cached healthy status does not prove tunnel security. ABS guarantees use of configured proxy with no direct transport fallback, not VPN firewall correctness. Live egress, tunnel-loss/restart, fail-closed firewall and recovery checks require WireGuard keys and remain unverified. Do not enable this experiment until host provisioning supplies and validates those guarantees.

## Analysis behavior

Disabled by default. Admins with library access/update permission can enable one podcast:

`POST /api/podcasts/:id/ad-analysis` with JSON `{ "enabled": true }`.

This authorizes public podcast title/author searches at Apple and gpodder.net, up to four public RSS fetches, and at most two extra audio requests per analysis. No accounts, private feed URL sharing, remote collectors, or playback changes. Optional server-side VPN proxy transport is described below. Disable with `{ "enabled": false }`. Existing episode reads never enqueue work.

Successful new downloads enqueue automatically. Retry an existing episode with `POST /api/podcasts/:id/episode/:episodeId/ad-analysis`, JSON `{}`. Response 202 means queued; 409 means disabled, duplicate, or queue full. Queue holds at most 32 jobs, concurrency one. Jobs are not durable; interrupted `running` results require explicit retry.

Episode JSON includes `adAnalysis`: version, algorithm, status/reason, exact local playback `sourceSha256`, candidate segments in original seconds, catalog attempts and sample fingerprint evidence. URLs/paths are not evidence fields. Same fingerprint is insufficient diversity, never evidence of ad-free audio. Segments mark plausible insertion differences, NOT proof of advertising. Identical ads remain invisible. No skip UI or cleaned export exists. Clients must verify exact file hash before using tags. Changed filesystem identity/metadata or scanner audio metadata makes results stale; even harmless whole-file tagging invalidates results.

Docker installs Alpine community package `chromaprint`, which provides `/usr/bin/fpcalc` (verified Alpine v3.23 package contents). Outside Docker install native Chromaprint 1.5.x or 1.6.x and FFmpeg. Set `FPCALC_PATH` to executable absolute path, or put `fpcalc` on server PATH before startup; resolution is cached once. FFmpeg uses ABS `FFMPEG_PATH`. Missing/unknown fingerprint runtime returns `unsupported`, never blocks startup or playback. No automatic binary downloads added.

Decoder accepts only local-file protocol, normalizes to bounded mono 11025 Hz PCM in unique temporary directory outside library, and removes temporary files on completion/failure. Each decode/fingerprint has 180 s deadline; input max 256 MiB, duration 50 s–4 h. Catalog/feed responses max 2 MiB; redirects max four, every hop SSRF-validated. Ambient HTTP proxy settings never apply.

Timing uses Chromaprint TEST2 source constants from upstream tags v1.5.1/v1.6.2 `src/fingerprinter_configuration.{h,cpp}`: item period 1365/11025 seconds; window delay `(19*1365+2731)/11025`. Native fixture test exercises >120 s, two sample rates, equal/unequal-length creative replacements at non-frame-aligned middle/tail slots, silence controls, prefix rejection, and playback SHA preservation. Alignment runs in a bounded worker; multi-frame anchor index limits long-input candidate work. Boundaries move inward, prefix/tail unanchored differences remain untagged. This is not a speech accuracy guarantee: non-frame-aligned edits and recompression can remain inconclusive. The first fork workflow passed an amd64 container native fingerprint smoke and published amd64/arm64 images; ARM runtime behavior and real podcast accuracy remain unverified. Proxy changes require separate review and publication; no ABS experiment has been deployed yet. Disabling cancels queued work and aborts active transport/native/worker processing; fresh consent, episode and file-identity checks precede every new external request, including redirects.
