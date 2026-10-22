const { expect } = require('chai')
const sinon = require('sinon')
const fs = require('fs')
const os = require('os')
const Path = require('path')
const manager = require('../../../server/managers/AdAnalysisManager')
const Logger = require('../../../server/Logger')

describe('sanitized ad-analysis diagnostics', () => {
  afterEach(() => sinon.restore())

  it('records actual native failure stage without exception payload', async () => {
    const stages = []
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-diagnostic-'))
    const path = Path.join(dir, 'input')
    fs.writeFileSync(path, 'not audio')
    try {
      try { await manager.fingerprint(path, dir, 'original', 60, undefined, (stage) => stages.push(stage)) } catch {}
      expect(stages[0]).to.equal('native_version')
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  it('persists timestamps and safe native/catalog stages, preserves guard and old-result overlay', async () => {
    const vm = require('vm')
    const { createRequire } = require('module')
    const filename = require.resolve('../../../server/managers/AdAnalysisManager')
    const realRequire = createRequire(filename)
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-diagnostic-'))
    const path = Path.join(dir, 'input')
    fs.writeFileSync(path, 'local fixture')
    const oldMetadata = global.MetadataPath
    global.MetadataPath = dir
    let failNative = false
    let nativeStage = 'native_decode'
    const secret = 'SECRET /private/audio https://token@example.org'
    const audioFile = { metadata: { path }, duration: 60 }
    const episode = { id: 'ep', title: 'Episode', publishedAt: new Date('2026-01-01'), audioFile, duration: 60, extraData: {}, save: async () => {} }
    const item = { id: 'item', extraData: { adAnalysisEnabled: true }, media: { title: 'Show & punctuation!', author: 'Public Author', podcastEpisodes: [episode] } }
    let failAt = 'catalog_search'
    let feedPadding = 0
    let corpusFailure = ''
    let inventoryCalls = 0
    let loadOutcome = ''
    let saves = 0
    const save = episode.save
    episode.save = async () => { saves++; await save() }
    const fixtureRequire = (name) => {
      if (name === '../Database') return { libraryItemModel: { getExpandedById: async () => { if (loadOutcome === 'throw') throw Object.assign(new Error(secret), { stderr: secret }); return loadOutcome === 'invalid' ? null : item } } }
      if (name === '../utils/adComparisonCorpus') return { validId: () => true, ComparisonCorpus: class {
        async load() { return { versions: [] } }
        async inventory() { inventoryCalls++; if (corpusFailure === 'inventory' || (corpusFailure === 'provider_inventory' && inventoryCalls === 2) || (corpusFailure === 'post_retain_inventory' && inventoryCalls === 3)) throw new Error('corpus_unavailable'); return { collectionPaused: false } }
        async retain() { if (corpusFailure === 'retain') throw new Error(secret); return { status: 'duplicate' } }
      } }
      if (name === 'child_process') return { execFile: (binary, args, options, callback) => {
        const stage = args[0] === '-version' ? 'native_version' : args.includes('-nostdin') ? 'native_decode' : 'native_fingerprint'
        if (failNative && stage === nativeStage) return callback(Object.assign(new Error(secret), { stderr: secret, code: secret, signal: secret }))
        if (stage === 'native_version') return callback(null, { stdout: 'fpcalc version 1.6.0' })
        if (stage === 'native_decode') { fs.writeFileSync(args[args.length - 1], Buffer.alloc(60 * 22050)); return callback(null, {}) }
        const { PERIOD, DELAY } = realRequire('../utils/daiAlignment')
        callback(null, { stdout: JSON.stringify({ fingerprint: Array(Math.round((60 - DELAY) / PERIOD)).fill(1) }) })
      } }
      if (name === 'axios') return { get: async (url, config) => {
        const stage = url.includes('itunes.apple.com') || url.includes('gpodder.net') ? 'catalog_search' : url.endsWith('/rss') ? 'catalog_feed' : 'catalog_audio'
        if (stage === failAt) throw new Error('maxContentLength SECRET /private/audio')
        let data = stage === 'catalog_search' ? JSON.stringify(url.includes('itunes.apple.com') ? { results: [{ feedUrl: 'https://example.org/rss', collectionName: item.media.title }] } : [{ url: 'https://example.org/rss', title: item.media.title }]) : '<rss version="2.0"><channel><title>Show</title><item><title>Episode</title><pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate><enclosure url="https://example.org/audio" type="audio/mpeg" length="100"/></item></channel></rss>'
        if (stage === 'catalog_feed') data = data.replace('</channel>', `<description>${'x'.repeat(feedPadding)}</description></channel>`)
        if (Buffer.byteLength(data) > config.maxContentLength) throw new Error('maxContentLength exceeded')
        return { status: 200, headers: {}, data: Buffer.from(data) }
      } }
      return realRequire(name)
    }
    const module = { exports: {} }
    // Native executable discovery only: use current executable; fake child boundary never executes it.
    const oldFpcalc = process.env.FPCALC_PATH
    process.env.FPCALC_PATH = process.execPath
    try {
      vm.runInThisContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})', { filename })(fixtureRequire, module, module.exports)
      const isolated = module.exports
      const worker = new isolated.AdAnalysisManager()
      worker.emit = () => {}
      const job = { itemId: 'item', episodeId: 'ep', path, key: 'item:ep', sourceSignature: isolated.signature(audioFile) }
      failNative = true
      for (nativeStage of ['native_version', 'native_decode', 'native_fingerprint']) {
        await worker.analyze(job)
        const result = episode.extraData.adAnalysis
        expect(result.diagnostic).to.deep.equal({ stage: nativeStage, reason: 'unexpected_error' })
        expect(result.status).to.equal('failed')
        expect(result.reason).to.equal('analysis_failed')
        expect(result.startedAt).to.match(/^\d{4}-\d{2}-\d{2}T.*Z$/)
        expect(Date.parse(result.completedAt)).to.be.at.least(Date.parse(result.startedAt))
        expect(JSON.stringify(result)).not.to.include(secret)
      }
      failNative = false
      for (failAt of ['catalog_search', 'catalog_feed', 'catalog_audio']) {
        await worker.analyze(job)
        expect(episode.extraData.adAnalysis.catalogs[0].diagnostic).to.deep.equal({ stage: failAt, reason: 'response_too_large' })
        expect(JSON.stringify(episode.extraData.adAnalysis)).not.to.include('SECRET')
      }
      failAt = ''
      feedPadding = 6 * 1024 * 1024
      await worker.analyze(job)
      expect(episode.extraData.adAnalysis.catalogs[0].diagnostic).to.equal(undefined)
      expect(episode.extraData.adAnalysis.samples[1].collectionStatus).to.equal('duplicate')
      feedPadding = 16 * 1024 * 1024
      await worker.analyze(job)
      expect(episode.extraData.adAnalysis.catalogs[0].diagnostic).to.deep.equal({ stage: 'catalog_feed', reason: 'response_too_large' })
      feedPadding = 0
      for (corpusFailure of ['retain', 'inventory', 'provider_inventory', 'post_retain_inventory']) {
        inventoryCalls = 0
        await worker.analyze(job)
        expect(episode.extraData.adAnalysis.diagnostic).to.deep.equal({ stage: 'corpus', reason: 'corpus_unavailable' })
        expect(JSON.stringify(episode.extraData.adAnalysis)).not.to.include(secret)
      }
      corpusFailure = ''
      for (const title of ['https://unsafe.example', 'bad\ncontrol']) {
        item.media.title = title
        await worker.analyze(job)
        expect(episode.extraData.adAnalysis.reason).to.equal('unsafe_public_metadata')
        expect(episode.extraData.adAnalysis.diagnostic.stage).to.equal('metadata')
      }
      const old = episode.extraData.adAnalysis
      const time = old.startedAt
      const completed = old.completedAt
      isolated.queue.push(job)
      expect(isolated.publicResult(episode, 'item').status).to.equal('queued')
      expect(isolated.publicResult(episode, 'item').startedAt).to.equal(undefined)
      isolated.queue.length = 0
      expect(isolated.publicResult(episode, 'item').startedAt).to.equal(time)
      expect(episode.extraData.adAnalysis).to.equal(old)
      const savedCount = saves
      const warnings = sinon.stub(Logger, 'warn')
      const info = sinon.stub(Logger, 'info')
      loadOutcome = 'throw'
      worker.queue = [job, { ...job, key: 'next', episodeId: 'next' }]
      // First actual analyze rejects before save; second actual analyze gets invalidated load.
      warnings.callsFake(() => { loadOutcome = 'invalid' })
      await worker.drain()
      expect(warnings.calledOnce).to.equal(true)
      expect(info.calledOnce).to.equal(true)
      expect(JSON.stringify(warnings.args)).to.include('unexpected_error').and.not.to.include(secret)
      expect(JSON.stringify(info.args)).to.include('not_started').and.to.include('next')
      expect(episode.extraData.adAnalysis).to.equal(old)
      expect(episode.extraData.adAnalysis.startedAt).to.equal(time)
      expect(episode.extraData.adAnalysis.completedAt).to.equal(completed)
      expect(saves).to.equal(savedCount)
      expect(worker.queue).to.have.length(0)
    } finally {
      global.MetadataPath = oldMetadata
      if (oldFpcalc === undefined) delete process.env.FPCALC_PATH
      else process.env.FPCALC_PATH = oldFpcalc
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('continues draining after unexpected rejection, does not warn for cancellation', async () => {
    const worker = new manager.AdAnalysisManager()
    const log = sinon.stub(Logger, 'warn')
    const secret = 'SECRET /private/audio https://token@example.org'
    const seen = []
    worker.queue = [{ itemId: 'item', episodeId: 'first', key: 'first' }, { itemId: 'item', episodeId: 'second', key: 'second' }]
    worker.analyze = async (job) => { seen.push(job.episodeId); if (job.key === 'first') throw Object.assign(new Error(secret), { stderr: secret, code: secret, signal: secret }) }
    await worker.drain()
    expect(seen).to.deep.equal(['first', 'second'])
    expect(log.calledOnce).to.equal(true)
    expect(JSON.stringify(log.args)).not.to.include(secret)
    expect(JSON.stringify(log.args)).to.include('unexpected_error')
    log.resetHistory()
    worker.queue = [{ itemId: 'item', episodeId: 'cancelled', key: 'cancelled' }]
    worker.analyze = async () => { throw new Error('cancelled') }
    await worker.drain()
    expect(log.called).to.equal(false)
  })
})
