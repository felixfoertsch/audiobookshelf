const fs = require('fs')
const os = require('os')
const Path = require('path')
const crypto = require('crypto')
const { promisify } = require('util')
const { execFile } = require('child_process')
const axios = require('axios')
const ssrfFilter = require('ssrf-req-filter')
const analysisProxy = require('../utils/adAnalysisProxy')
const { ComparisonCorpus, validId } = require('../utils/adComparisonCorpus')
const { parsePodcastRssFeedXml } = require('../utils/podcastUtils')
const { normalize, matchesEpisode, PERIOD, DELAY } = require('../utils/daiAlignment')
const { Worker } = require('worker_threads')
const run = promisify(execFile)
const Logger = require('../Logger')
const diagnosticReasons = new Set(['cancelled', 'unsupported_runtime', 'duration_limit', 'audio_size_limit', 'duration_or_decode_mismatch', 'incomplete_fingerprint', 'invalid_fingerprint', 'http_error', 'response_too_large', 'request_timeout', 'redirect_limit', 'unsafe_url', 'request_failed_or_blocked', 'proxy_failed_or_blocked', 'invalid_analysis_proxy', 'malformed_catalog', 'corpus_unavailable', 'unsafe_public_metadata'])
const diagnostic = (stage, error) => ({ stage, reason: diagnosticReasons.has(error?.message) ? error.message : 'unexpected_error' })
const lifecycle = (job, outcome, error) => Logger[outcome === 'not_started' ? 'info' : 'warn']('[AdAnalysis] lifecycle', { itemId: job.itemId, episodeId: job.episodeId, outcome, ...diagnostic('attempt', error) })

function alignAsync(original, variant, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(Path.join(__dirname, '../utils/daiAlignmentWorker.js'), { workerData: { original, variant }, resourceLimits: { maxOldGenerationSizeMb: 128 } })
    const cancel = () => { worker.terminate(); reject(new Error('cancelled')) }
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('alignment_timeout')) }, 10000)
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', (code) => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); if (code) reject(new Error('alignment_failed')) })
  })
}

function combineSegments(segments) {
  const emitted = []
  for (const segment of segments.sort((a, b) => a.start - b.start)) {
    if (!emitted.length || segment.start >= emitted[emitted.length - 1].end) emitted.push(segment)
  }
  return emitted
}
const MAX_DURATION = 14400
const MAX_AUDIO = 256 * 1024 * 1024
const algorithm = 'chromaprint-test2-inward-v1'
let fpcalcPath

function executable() {
  if (fpcalcPath !== undefined) return fpcalcPath
  const names = process.env.FPCALC_PATH ? [process.env.FPCALC_PATH] : (process.env.PATH || '').split(Path.delimiter).map((dir) => Path.join(dir, process.platform === 'win32' ? 'fpcalc.exe' : 'fpcalc'))
  fpcalcPath = names.find((name) => {
    try { fs.accessSync(name, fs.constants.X_OK); return true } catch { return false }
  }) || null
  return fpcalcPath
}

async function sha256(path) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function signature(audioFile) {
  return JSON.stringify(audioFile || null)
}

function jobPayload(item, episode, status, adAnalysis = null) {
  return { libraryItemId: item.id, episodeId: episode.id, adAnalysis: adAnalysis || { version: 1, status, reason: null, segments: [] }, adAnalysisEnabled: item.extraData?.adAnalysisEnabled === true }
}

function publicResult(episode, itemId) {
  const key = itemId ? `${itemId}:${episode.id}` : null
  const queued = key && module.exports.queue.find((job) => job.key === key)
  const running = key && module.exports.activeEpisodes.has(key)
  const job = queued || (key && module.exports.activeJobs.get(key))
  if (job) {
    if (job.sourceSignature === signature(episode.audioFile)) return { version: 1, status: running ? 'running' : 'queued', reason: null, segments: [] }
    return { version: 1, status: 'stale', reason: 'source_changed', segments: [] }
  }
  const result = episode.extraData?.adAnalysis
  if (!result) return null
  let unchanged = false
  try {
    const stat = fs.statSync(episode.audioFile.metadata.path)
    unchanged = result.sourceStat === `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`
  } catch { /* Deleted or inaccessible files cannot carry applicable tags. */ }
  if (!unchanged || result.sourceSignature !== signature(episode.audioFile)) return { version: 1, status: 'stale', reason: 'source_changed', segments: [] }
  const { sourceSignature, sourceStat, ...json } = result
  const publicJson = structuredClone(json)
  if (publicJson.status === 'inconclusive' && !publicJson.segments?.length && publicJson.samples?.some((sample) => sample.status === 'no_inserted_audio')) {
    publicJson.status = 'no_difference'
    publicJson.reason = 'no_inserted_audio'
  }
  return publicJson
}

// Redirects revalidate each destination. Only analysis opts into this proxy;
// cookies, user headers, ambient proxies and global SSRF opt-outs never apply.
async function request(url, limit = 2 * 1024 * 1024, timeout = 10000, signal, checkpoint) {
  const proxy = analysisProxy.configuration()
  const deadline = Date.now() + timeout
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
  for (let redirects = 0; redirects <= 4; redirects++) {
    await checkpoint?.()
    if (signal?.aborted) throw new Error('cancelled')
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('unsafe_url')
    if (Date.now() >= deadline) throw new Error('request_timeout')
    let response
    let agents
    try {
      agents = proxy ? await analysisProxy.agents(parsed, proxy, controller.signal) : { httpAgent: ssrfFilter(parsed.href), httpsAgent: ssrfFilter(parsed.href) }
      response = await axios.get(parsed.href, {
        signal: controller.signal, proxy: false, maxRedirects: 0, timeout: deadline - Date.now(), responseType: 'arraybuffer',
        maxContentLength: limit, maxBodyLength: limit, validateStatus: () => true,
        ...agents,
        headers: { 'User-Agent': 'audiobookshelf', 'Accept-Encoding': 'identity' }
      })
    } catch (error) {
      if (controller.signal.aborted || error.code === 'ECONNABORTED') throw new Error('request_timeout')
      if (error.message?.includes('maxContentLength')) throw new Error('response_too_large')
      if (proxy && error.message === 'unsafe_url') throw error
      throw new Error(proxy ? 'proxy_failed_or_blocked' : 'request_failed_or_blocked')
    } finally { agents?.httpAgent.destroy(); agents?.httpsAgent.destroy() }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location || redirects === 4) throw new Error('redirect_limit')
      url = new URL(response.headers.location, parsed).href
      continue
    }
    if (response.status < 200 || response.status >= 300) throw new Error('http_error')
    if (response.data.length > limit) throw new Error('response_too_large')
    if (controller.signal.aborted || Date.now() >= deadline) throw new Error('request_timeout')
    return { data: response.data, url: parsed.href }
  }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}

async function fingerprint(path, dir, label, duration, signal, stage = () => {}) {
  stage('native_version')
  const binary = executable()
  if (!binary) throw new Error('unsupported_runtime')
  if ((await fs.promises.stat(path)).size > MAX_AUDIO) throw new Error('audio_size_limit')
  const version = await run(binary, ['-version'], { timeout: 5000, maxBuffer: 4096 })
  // Timing constants verified against 1.5.1/1.6.2 source; unknown versions fail closed.
  if (!/fpcalc version 1\.(5|6)\./.test(version.stdout)) throw new Error('unsupported_runtime')
  if (duration != null && (!Number.isFinite(duration) || duration < 50 || duration > MAX_DURATION)) throw new Error('duration_limit')
  const pcm = Path.join(dir, `${label}.pcm`)
  try {
    // Only a local input may be decoded; demuxers cannot open nested network URLs.
    stage('native_decode')
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mp3,wav,mov,ogg,flac,aac,matroska,webm,aiff,asf', '-threads', '1', '-i', path, '-map', '0:a:0', '-vn', '-t', String(MAX_DURATION + 1), '-ac', '1', '-ar', '11025', '-f', 's16le', '-fs', String((MAX_DURATION + 1) * 22050), pcm], { signal, killSignal: 'SIGKILL', timeout: 180000, maxBuffer: 65536 })
    const size = (await fs.promises.stat(pcm)).size
    if (size < 50 * 22050 || size >= MAX_DURATION * 22050 || (duration != null && Math.abs(size / 22050 - duration) > 3)) throw new Error('duration_or_decode_mismatch')
    stage('native_fingerprint')
    const { stdout } = await run(binary, ['-format', 's16le', '-rate', '11025', '-channels', '1', '-algorithm', '2', '-length', '0', '-raw', '-json', pcm], { signal, killSignal: 'SIGKILL', timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
    const data = JSON.parse(stdout)
    if (!Array.isArray(data.fingerprint) || !data.fingerprint.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) throw new Error('invalid_fingerprint')
    if (Math.abs(data.fingerprint.length * PERIOD + DELAY - size / 22050) > 1) throw new Error('incomplete_fingerprint')
    Object.defineProperty(data.fingerprint, 'duration', { value: size / 22050 })
    return data.fingerprint
  } finally {
    await fs.promises.rm(pcm, { force: true })
  }
}

function catalogResults(provider, payload) {
  const rows = provider === 'apple' ? payload?.results : payload
  if (!Array.isArray(rows)) throw new Error('malformed_catalog')
  if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('malformed_catalog')
  const results = rows.slice(0, 5).map((row) => ({ provider, url: provider === 'apple' ? row.feedUrl : row.url, title: provider === 'apple' ? row.collectionName : row.title, author: provider === 'apple' ? row.artistName : row.author }))
  if (results.some((r) => typeof r.url !== 'string' || typeof r.title !== 'string' || (r.author != null && typeof r.author !== 'string'))) throw new Error('malformed_catalog')
  return results
}

class AdAnalysisManager {
  constructor() {
    this.queue = []
    this.keys = new Set()
    this.running = false
    this.active = new Map()
    this.activeJobs = new Map()
    this.activeEpisodes = new Set()
  }

  emit(payload) {
    require('../SocketAuthority').libraryItemDataEmitter('episode_ad_analysis', payload.libraryItemId, payload).catch(() => {})
  }

  cancel(itemId) {
    this.queue = this.queue.filter((job) => {
      if (job.itemId !== itemId) return true
      this.keys.delete(job.key)
      this.emit({ libraryItemId: itemId, episodeId: job.episodeId, adAnalysis: { version: 1, status: 'cancelled', reason: null, segments: [] }, adAnalysisEnabled: false })
      return false
    })
    this.active.get(itemId)?.abort()
    for (const [key, job] of this.activeJobs) {
      if (job.itemId === itemId) this.emit({ libraryItemId: itemId, episodeId: job.episodeId, adAnalysis: { version: 1, status: 'cancelled', reason: null, segments: [] }, adAnalysisEnabled: false })
    }
  }

  enqueue(item, episode) {
    const path = episode.audioFile?.metadata?.path
    if (item.extraData?.adAnalysisEnabled !== true || typeof path !== 'string' || !Path.isAbsolute(path) || !validId(item.id) || !validId(episode.id)) return false
    const key = `${item.id}:${episode.id}`
    if (this.keys.has(key) || this.keys.size >= 32) return false
    this.keys.add(key)
    this.queue.push({ itemId: item.id, episodeId: episode.id, path, sourceSignature: signature(episode.audioFile), key })
    this.emit(jobPayload(item, episode, 'queued'))
    setTimeout(() => this.drain(), 0)
    return true
  }

  async drain() {
    if (this.running || !this.queue.length) return
    this.running = true
    try {
      while (this.queue.length) {
        const job = this.queue.shift()
        try { await this.analyze(job) } catch (error) { if (error?.message !== 'cancelled') lifecycle(job, 'rejected', error) }
        finally { this.keys.delete(job.key) }
      }
    } finally { this.running = false }
  }

  async analyze(job) {
    const Database = require('../Database')
    const load = async () => {
      const item = await Database.libraryItemModel.getExpandedById(job.itemId)
      const episode = item?.media?.podcastEpisodes?.find((ep) => ep.id === job.episodeId)
      if (item?.extraData?.adAnalysisEnabled !== true || !episode || signature(episode.audioFile) !== job.sourceSignature) return null
      return { item, episode }
    }
    const initial = await load()
    if (!initial) { lifecycle(job, 'not_started'); return }
    const controller = new AbortController()
    this.active.set(job.itemId, controller)
    this.activeJobs.set(job.key, job)
    this.activeEpisodes.add(job.key)
    this.emit(jobPayload(initial.item, initial.episode, 'running'))
    let sourceStat
    const checkpoint = async () => {
      if (controller.signal.aborted || !(await load())) throw new Error('cancelled')
      if (sourceStat) {
        const stat = await fs.promises.stat(job.path).catch(() => null)
        if (!stat || sourceStat !== `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`) throw new Error('cancelled')
      }
    }
    const guardedRequest = async (url, limit, timeout) => { await checkpoint(); return request(url, limit, timeout, controller.signal, checkpoint) }
    let hash
    let dir
    const route = process.env.AD_ANALYSIS_PROXY_URL === undefined ? 'direct' : 'vpn_proxy'
    let stage = 'source'
    const setStage = (value) => { stage = value }
    const result = { startedAt: new Date().toISOString(), version: 1, algorithm, route, status: 'running', reason: null, sourceSignature: job.sourceSignature, sourceSha256: null, segments: [], samples: [], catalogs: [] }
    const save = async () => {
      const current = await load()
      if (!current) return false
      current.episode.extraData = { ...current.episode.extraData, adAnalysis: result }
      await current.episode.save()
      return true
    }
    try {
      const stat = await fs.promises.stat(job.path)
      result.sourceStat = sourceStat = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`
      hash = await sha256(job.path)
      result.sourceSha256 = hash
      if (!(await save())) return
      setStage('native_version')
      if (!executable()) throw new Error('unsupported_runtime')
      dir = await fs.promises.mkdtemp(Path.join(os.tmpdir(), 'abs-dai-'))
      await checkpoint()
      const original = await fingerprint(job.path, dir, 'original', initial.episode.duration, controller.signal, setStage)
      result.samples.push({ origin: 'subscribed', route: 'direct', fingerprintSha256: crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex') })
      setStage('corpus')
      const corpus = new ComparisonCorpus()
      let retained
      try { retained = await corpus.load(job.itemId, job.episodeId, checkpoint) } catch (error) {
        if (error.message === 'cancelled' || controller.signal.aborted) throw error
        result.corpus = { collectionPaused: true, reason: 'corpus_unavailable' }
        throw new Error('corpus_unavailable')
      }
      const refreshInventory = async () => { setStage('corpus'); result.corpus = await corpus.inventory(job.itemId, job.episodeId) }
      await refreshInventory()
      const fingerprints = new Set([result.samples[0].fingerprintSha256])
      const compare = async (variant, variantPath, sample) => {
        setStage('comparison')
        await checkpoint()
        const sourceHash = await sha256(job.path)
        if (sourceHash !== hash) throw new Error('cancelled')
        result.samples.push(sample)
        fingerprints.add(sample.fingerprintSha256)
        // Byte-identical frames give exact edges; re-encoded or non-MPEG copies fall back to Chromaprint.
        let comparison = await alignAsync(job.path, variantPath, controller.signal).catch(() => null)
        sample.method = 'mpeg_frames'
        if (!comparison?.segments.length && comparison?.reason !== 'no_inserted_audio') {
          comparison = await alignAsync(original, variant, controller.signal)
          sample.method = 'chromaprint'
        }
        sample.status = comparison.reason
        sample.matchedSeconds = comparison.matchedSeconds
        result.segments.push(...comparison.segments.map((segment) => ({ ...segment, sampleIndex: result.samples.length - 1 })))
      }
      for (const saved of retained.versions) {
        await compare(saved.fingerprint, saved.frames, { origin: saved.provider, route: saved.route, versionId: saved.versionId, sha256: saved.sha256, fingerprintSha256: saved.fingerprintSha256, retained: true })
      }
      setStage('metadata')
      const title = initial.item.media.title
      const author = initial.item.media.author
      if (!result.corpus.collectionPaused && (!normalize(title) || title.length > 200 || (author && author.length > 200) || /https?:|[\r\n\u0000]/i.test(`${title} ${author || ''}`))) throw new Error('unsafe_public_metadata')
      const query = encodeURIComponent(`${title} ${author || ''}`.trim())
      const feeds = new Map()
      const audioUrls = new Set()
      let extras = 0
      for (const provider of ['apple', 'gpodder']) {
        await checkpoint()
        await refreshInventory()
        if (result.corpus.collectionPaused) break
        const attempt = { provider, route, status: 'empty' }
        result.catalogs.push(attempt)
        try {
          const endpoint = provider === 'apple' ? `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=5&term=${query}` : `https://gpodder.net/search.json?q=${query}`
          setStage('catalog_search')
          const response = await guardedRequest(endpoint)
          const candidates = catalogResults(provider, JSON.parse(response.data.toString()))
          attempt.status = candidates.length ? 'no_matching_episode' : 'empty'
          let providerFeeds = 0
          for (const candidate of candidates) {
            if (normalize(candidate.title) !== normalize(title) || (author && normalize(candidate.author) && normalize(candidate.author) !== normalize(author))) continue
            let feed = feeds.get(candidate.url)
            if (!feeds.has(candidate.url)) {
              if (providerFeeds >= 2 || feeds.size >= 4) continue
              providerFeeds++
              feeds.set(candidate.url, null)
              setStage('catalog_feed')
              const response = await guardedRequest(candidate.url)
              feed = (await parsePodcastRssFeedXml(response.data.toString()))?.podcast
              feeds.set(candidate.url, feed)
            }
            const matches = feed?.episodes?.filter((ep) => matchesEpisode(initial.episode, ep)) || []
            if (matches.length !== 1) continue
            if (extras >= 2) break
            const url = matches[0].enclosure.url
            extras++
            const sample = { origin: provider, route, requestAttempt: extras, repeatedUrl: audioUrls.has(url), status: 'fetching' }
            result.samples.push(sample)
            audioUrls.add(url)
            setStage('catalog_audio')
            const response = await guardedRequest(url, MAX_AUDIO, 120000)
            sample.repeatedFinalUrl = audioUrls.has(response.url) && response.url !== url
            audioUrls.add(response.url)
            const path = Path.join(dir, `sample${extras}`)
            await fs.promises.writeFile(path, response.data, { flag: 'wx' })
            await checkpoint()
            const variant = await fingerprint(path, dir, `variant${extras}`, null, controller.signal, setStage)
            await checkpoint()
            sample.fingerprintSha256 = crypto.createHash('sha256').update(JSON.stringify(variant)).digest('hex')
            sample.sha256 = crypto.createHash('sha256').update(response.data).digest('hex')
            let publication
            setStage('corpus')
            try { publication = await corpus.retain({ itemId: job.itemId, episodeId: job.episodeId, data: response.data, fingerprint: variant, duration: variant.duration, provider, route }, async () => {
              await checkpoint()
              if (await sha256(job.path) !== hash) throw new Error('cancelled')
              await checkpoint()
            }) } catch (error) {
              if (error.message === 'cancelled' || controller.signal.aborted) throw error
              result.corpus = { collectionPaused: true, reason: 'corpus_unavailable' }
              throw new Error('corpus_unavailable')
            }
            sample.collectionStatus = publication.status
            sample.versionId = publication.versionId
            await refreshInventory()
            if (publication.status === 'paused') { sample.status = 'collection_paused'; sample.reason = publication.reason; break }
            // Duplicates already compared from durable inventory; never bypass capacity with transient samples.
            if (publication.status === 'duplicate') { sample.status = 'duplicate'; break }
            result.samples.pop()
            await compare(variant, path, sample)
            attempt.status = 'sampled'
            break
          }
        } catch (error) {
          if (error.message === 'cancelled' || controller.signal.aborted) return
          if (error.message === 'corpus_unavailable') throw error
          const pending = result.samples.find((sample) => sample.origin === provider && sample.status === 'fetching')
          if (pending) { pending.status = 'failed'; pending.reason = 'sample_failed' }
          attempt.diagnostic = diagnostic(stage, error)
          attempt.status = 'failed'
          attempt.reason = ['http_error', 'response_too_large', 'request_timeout', 'redirect_limit', 'unsafe_url', 'request_failed_or_blocked', 'proxy_failed_or_blocked', 'invalid_analysis_proxy', 'unsupported_runtime', 'duration_limit', 'incomplete_fingerprint', 'duration_or_decode_mismatch', 'invalid_fingerprint', 'malformed_catalog'].includes(error.message) ? error.message : 'invalid_source'
        }
      }
      result.segments = combineSegments(result.segments)
      result.diversity = { requests: extras, distinctFingerprints: fingerprints.size, uniqueUrls: audioUrls.size }
      const comparedSamples = result.samples.filter((sample) => sample.method)
      const noMatchingCatalogs = result.catalogs.length > 0 && result.catalogs.every((catalog) => ['empty', 'no_matching_episode'].includes(catalog.status))
      if (!result.segments.length && !comparedSamples.length && noMatchingCatalogs) {
        result.status = 'unsupported'
        result.reason = 'no_matching_episode'
      } else {
        result.status = result.segments.length ? 'candidates' : result.samples.some((sample) => sample.status === 'no_inserted_audio') ? 'no_difference' : 'inconclusive'
        result.reason = result.segments.length ? 'candidate_insertions_not_advertising_proof' : result.status === 'no_difference' ? 'no_inserted_audio' : fingerprints.size < 2 ? 'insufficient_diversity' : 'no_safe_candidates'
      }
    } catch (error) {
      result.diagnostic = diagnostic(stage, error)
      result.status = error.message === 'cancelled' || controller.signal.aborted ? 'cancelled' : ['unsupported_runtime', 'duration_limit', 'audio_size_limit'].includes(error.message) ? 'unsupported' : 'failed'
      result.reason = ['corpus_unavailable', 'unsupported_runtime', 'duration_limit', 'audio_size_limit', 'duration_or_decode_mismatch', 'incomplete_fingerprint', 'unsafe_public_metadata'].includes(error.message) ? error.message : 'analysis_failed'
      result.segments = []
    } finally {
      this.active.delete(job.itemId)
      this.activeJobs.delete(job.key)
      this.activeEpisodes.delete(job.key)
      if (dir) await fs.promises.rm(dir, { recursive: true, force: true })
      if (hash && await sha256(job.path).catch(() => null) !== hash) {
        result.status = 'stale'
        result.reason = 'source_changed'
        result.segments = []
      }
      result.completedAt = new Date().toISOString()
      if (!controller.signal.aborted && await save()) {
        const current = await load()
        if (current) this.emit(jobPayload(current.item, current.episode, result.status, publicResult(current.episode, current.item.id)))
      }
    }
  }
}

module.exports = new AdAnalysisManager()
module.exports.AdAnalysisManager = AdAnalysisManager
module.exports.sha256 = sha256
module.exports.signature = signature
module.exports.publicResult = publicResult
module.exports.request = request
module.exports.fingerprint = fingerprint
module.exports.catalogResults = catalogResults
module.exports.combineSegments = combineSegments
module.exports.alignAsync = alignAsync
