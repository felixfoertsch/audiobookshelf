const fs = require('fs')
const Path = require('path')
const crypto = require('crypto')
const fsp = fs.promises
const ALGORITHM = 'chromaprint-test2-inward-v1'
const MAX_AUDIO = 256 * 1024 * 1024
const MAX_FP = 2 * 1024 * 1024
const LIMIT = 10 * 1024 * 1024 * 1024
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex')
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
const hex = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)
const validFingerprint = (fp) => Array.isArray(fp) && fp.length > 0 && fp.length <= 120000 && fp.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)

async function regular(path, max) {
  const handle = await fsp.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > max) throw new Error('corpus_invalid')
    return await handle.readFile()
  } finally { await handle.close() }
}

// Single analysis worker owns writes. No cross-process writer coordination.
class ComparisonCorpus {
  constructor(root = Path.join(global.MetadataPath, 'ad-analysis-corpus'), limit = LIMIT) {
    this.root = root
    this.limit = limit
  }

  async scan() {
    // Metadata root is trusted configuration; reject a substituted or nonprivate corpus root.
    const stat = await fsp.lstat(this.root).catch((e) => { if (e.code !== 'ENOENT') throw e })
    if (!stat) return { versions: [], totalBytes: 0 }
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('corpus_invalid')
    const versions = []
    let totalBytes = 0
    for (const entry of await fsp.readdir(this.root, { withFileTypes: true })) {
      // Interrupted stages remain evidence; stop collection until operator inspects them.
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) throw new Error('corpus_invalid')
      const dir = Path.join(this.root, entry.name)
      const names = await fsp.readdir(dir)
      if (names.length !== 3 || !['audio', 'fingerprint.json', 'manifest.json'].every((name) => names.includes(name))) throw new Error('corpus_invalid')
      const bytes = await regular(Path.join(dir, 'manifest.json'), 4096)
      const m = JSON.parse(bytes)
      if (m.version !== 1 || m.format !== 'raw-uint32-json' || m.algorithm !== ALGORITHM || m.versionId !== entry.name || !validId(m.itemId) || !validId(m.episodeId) || !hex(m.sha256) || !hex(m.fingerprintSha256) || !['apple', 'gpodder'].includes(m.provider) || !['direct', 'vpn_proxy'].includes(m.route) || !Number.isFinite(m.duration) || m.duration < 50 || m.duration > 14400 || typeof m.collectedAt !== 'string' || new Date(m.collectedAt).toISOString() !== m.collectedAt || !Number.isInteger(m.audioBytes) || m.audioBytes < 1 || m.audioBytes > MAX_AUDIO || !Number.isInteger(m.fingerprintBytes) || m.fingerprintBytes < 1 || m.fingerprintBytes > MAX_FP || Object.keys(m).sort().join(',') !== 'algorithm,audioBytes,collectedAt,duration,episodeId,fingerprintBytes,fingerprintSha256,format,itemId,provider,route,sha256,version,versionId') throw new Error('corpus_invalid')
      if (m.versionId !== digest(JSON.stringify([m.itemId, m.episodeId, m.sha256, m.fingerprintSha256]))) throw new Error('corpus_invalid')
      if (versions.filter((v) => v.itemId === m.itemId && v.episodeId === m.episodeId).length >= 5) throw new Error('corpus_invalid')
      for (const [name, size] of [['audio', m.audioBytes], ['fingerprint.json', m.fingerprintBytes]]) {
        const stat = await fsp.lstat(Path.join(dir, name))
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== size) throw new Error('corpus_invalid')
      }
      totalBytes += m.audioBytes + m.fingerprintBytes + bytes.length
      if (!Number.isSafeInteger(totalBytes)) throw new Error('corpus_invalid')
      versions.push(m)
    }
    return { versions, totalBytes }
  }

  async inventory(itemId, episodeId) {
    if (!validId(itemId) || !validId(episodeId)) throw new Error('corpus_invalid_id')
    const state = await this.scan()
    const versions = state.versions.filter((m) => m.itemId === itemId && m.episodeId === episodeId)
    const reason = versions.length >= 5 ? 'episode_limit' : this.limit - state.totalBytes < MAX_AUDIO + MAX_FP + 4096 ? 'corpus_limit' : null
    return { version: 1, count: versions.length, totalBytes: state.totalBytes, limitBytes: this.limit, collectionPaused: !!reason, reason, versions }
  }

  async load(itemId, episodeId) {
    const state = await this.inventory(itemId, episodeId)
    for (const m of state.versions) {
      const dir = Path.join(this.root, m.versionId)
      const bytes = await regular(Path.join(dir, 'fingerprint.json'), MAX_FP)
      const fingerprint = JSON.parse(bytes)
      if (digest(bytes) !== m.fingerprintSha256 || !validFingerprint(fingerprint)) throw new Error('corpus_invalid')
      const hash = crypto.createHash('sha256')
      const handle = await fsp.open(Path.join(dir, 'audio'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
      try { for await (const chunk of handle.createReadStream()) hash.update(chunk) } finally { await handle.close() }
      if (hash.digest('hex') !== m.sha256) throw new Error('corpus_invalid')
      m.fingerprint = fingerprint
    }
    return state
  }

  async retain(input, checkpoint = async () => {}) {
    const { itemId, episodeId, data, fingerprint, duration, provider, route } = input
    if (!validId(itemId) || !validId(episodeId) || !Buffer.isBuffer(data) || !data.length || data.length > MAX_AUDIO || !validFingerprint(fingerprint) || !Number.isFinite(duration) || duration < 50 || duration > 14400 || !['apple', 'gpodder'].includes(provider) || !['direct', 'vpn_proxy'].includes(route)) throw new Error('corpus_invalid_input')
    await checkpoint()
    await fsp.mkdir(this.root, { mode: 0o700 }).catch((e) => { if (e.code !== 'EEXIST') throw e })
    const state = await this.inventory(itemId, episodeId)
    // Always sync parent: a previous mkdir may have survived a failed parent sync.
    const parent = await fsp.open(Path.dirname(this.root), 'r')
    try { await parent.sync() } finally { await parent.close() }
    const fp = Buffer.from(JSON.stringify(fingerprint))
    if (fp.length > MAX_FP) throw new Error('corpus_invalid_input')
    const sha256 = digest(data)
    const fingerprintSha256 = digest(fp)
    const duplicate = state.versions.find((m) => m.sha256 === sha256 || m.fingerprintSha256 === fingerprintSha256)
    if (duplicate) return { status: 'duplicate', versionId: duplicate.versionId, sha256, fingerprintSha256 }
    if (state.count >= 5) return { status: 'paused', reason: 'episode_limit' }
    const versionId = digest(JSON.stringify([itemId, episodeId, sha256, fingerprintSha256]))
    const manifest = { version: 1, versionId, itemId, episodeId, algorithm: ALGORITHM, sha256, fingerprintSha256, provider, route, collectedAt: new Date().toISOString(), duration, audioBytes: data.length, fingerprintBytes: fp.length, format: 'raw-uint32-json' }
    const bytes = Buffer.from(JSON.stringify(manifest))
    if (state.totalBytes + data.length + fp.length + bytes.length > this.limit) return { status: 'paused', reason: 'corpus_limit' }
    const stage = await fsp.mkdtemp(Path.join(this.root, '.stage-'))
    try {
      for (const [name, content] of [['audio', data], ['fingerprint.json', fp], ['manifest.json', bytes]]) {
        const file = await fsp.open(Path.join(stage, name), 'wx', 0o600)
        try { await file.writeFile(content); await file.sync() } finally { await file.close() }
      }
      const handle = await fsp.open(stage, 'r')
      try { await handle.sync() } finally { await handle.close() }
      await checkpoint()
      await fsp.rename(stage, Path.join(this.root, versionId))
      const root = await fsp.open(this.root, 'r')
      try { await root.sync() } finally { await root.close() }
      return { status: 'retained', ...manifest }
    } finally { await fsp.rm(stage, { recursive: true, force: true }) }
  }
}
module.exports = { ComparisonCorpus, ALGORITHM, validId }
