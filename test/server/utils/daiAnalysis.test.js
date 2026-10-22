const { expect } = require('chai')
const fs = require('fs')
const os = require('os')
const Path = require('path')
const { execFileSync } = require('child_process')
const { align, matchesEpisode, normalize, PERIOD } = require('../../../server/utils/daiAlignment')
const manager = require('../../../server/managers/AdAnalysisManager')
const sinon = require('sinon')
const axios = require('axios')

describe('DAI candidate analysis', () => {
  it('requires episode title and date, not title alone', () => {
    expect(normalize('Show: A!')).to.equal('show a')
    expect(matchesEpisode({ title: 'A', publishedAt: '2026-01-01' }, { title: 'A', publishedAt: '2025-01-01' })).to.equal(false)
    expect(matchesEpisode({ title: 'A' }, { title: 'A' })).to.equal(false)
  })
  it('never complements unmatched, identical, or truncated audio', () => {
    let seed = 42
    const a = Array.from({ length: 1500 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed })
    expect(align(a, a).reason).to.equal('insufficient_diversity')
    expect(align(a, a.map((n) => n + 2000)).segments).to.deep.equal([])
    expect(align(a, a.slice(0, 800)).segments).to.deep.equal([])
    expect(align(Array(1500).fill(0), Array(1500).fill(1)).segments).to.deep.equal([])
    expect(align(Array.from({ length: 1500 }, (_, i) => i % 8), Array.from({ length: 1500 }, (_, i) => i % 9)).segments).to.deep.equal([])
  })
  it('retains only safe interiors of anchored insertion gaps', () => {
    let seed = 42
    const a = Array.from({ length: 1500 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed })
    const b = a.slice(0, 600).concat(a.slice(800))
    const result = align(a, b)
    expect(result.segments).to.have.length(1)
    expect(result.segments[0].start).to.be.greaterThan(600 * PERIOD)
    expect(result.segments[0].end).to.be.lessThan(800 * PERIOD)
  })
  it('keeps internal insertions despite an unmatched prefix', () => {
    let seed = 10
    const original = Array.from({ length: Math.round(2464 / PERIOD) }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed })
    const variant = original.slice(Math.round(29 / PERIOD), Math.round(982 / PERIOD)).concat(original.slice(Math.round(1042 / PERIOD)))
    const result = align(original, variant)
    expect(result.segments).to.have.length(1)
    expect(result.segments[0].start).to.be.greaterThan(982)
    expect(result.segments[0].end).to.be.lessThan(1042)
    expect(result.segments[0].end - result.segments[0].start).to.be.within(45, 60)
  })
  it('keeps unmatched tails untagged', () => {
    let seed = 1
    const original = Array.from({ length: Math.round(2572 / PERIOD) }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed })
    expect(align(original, original.slice(0, -Math.round(18 / PERIOD))).segments).to.deep.equal([])
  })
  it('refuses replacement ambiguity only when ends are unanchored', () => {
    let seed = 194
    const random = (length) => Array.from({ length }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed })
    const original = random(Math.round(2600 / PERIOD))
    const start = Math.round(1000 / PERIOD)
    for (const [localSeconds, catalogSeconds] of [[20.8, 20.8], [30, 60], [60, 30]]) {
      const end = start + Math.round(localSeconds / PERIOD)
      const variant = original.slice(0, start).concat(random(Math.round(catalogSeconds / PERIOD)), original.slice(end))
      // End-anchored creative replacement is an existing contract, not insertion proof.
      expect(align(original, variant).segments).to.have.length(1)
      const prefixTrimmed = variant.slice(Math.round(29 / PERIOD))
      expect(align(original, prefixTrimmed).segments).to.deep.equal([])
    }
  })
  it('normalizes provider contracts without treating catalog URLs as audio diversity', () => {
    const apple = manager.catalogResults('apple', { results: [{ feedUrl: 'https://example.org/feed', collectionName: 'Show', artistName: 'Author' }] })
    const gpodder = manager.catalogResults('gpodder', [{ url: 'https://example.org/feed', title: 'Show', author: 'Author' }])
    expect(apple[0].url).to.equal(gpodder[0].url)
    expect(apple[0].provider).not.to.equal(gpodder[0].provider)
    expect(() => manager.catalogResults('gpodder', {})).to.throw('malformed_catalog')
  })
  it('deduplicates and drains bounded queue, including worker failure', async () => {
    const worker = new manager.AdAnalysisManager()
    const seen = []
    worker.analyze = async (job) => { seen.push(job.episodeId); if (job.episodeId === '0') throw new Error('failure') }
    const item = { id: 'item', extraData: { adAnalysisEnabled: true } }
    const episode = (id) => ({ id, audioFile: { metadata: { path: '/safe/local' } } })
    expect(worker.enqueue(item, episode('0'))).to.equal(true)
    expect(worker.enqueue(item, episode('0'))).to.equal(false)
    for (let i = 1; i < 40; i++) worker.enqueue(item, episode(String(i)))
    expect(worker.queue).to.have.length(32)
    await worker.drain()
    await worker.drain()
    expect(seen).to.have.length(32)
    expect(worker.keys.size).to.equal(0)
    expect(worker.running).to.equal(false)
    expect(worker.enqueue({ ...item, extraData: {} }, episode('off'))).to.equal(false)
  })
  it('blocks private network requests and unsafe schemes', async () => {
    for (const url of ['http://127.0.0.1:9/', 'http://[::1]:9/', 'file:///etc/passwd', 'https://user:pass@example.org']) {
      let error
      try { await manager.request(url) } catch (err) { error = err }
      expect(error).to.be.instanceOf(Error)
    }
  })
  it('bounds redirects, bytes, timeouts and disables ambient proxies', async () => {
    const stub = sinon.stub(axios, 'get')
    try {
      stub.resolves({ status: 302, headers: { location: '/again' }, data: Buffer.alloc(0) })
      let error
      try { await manager.request('https://example.org/feed') } catch (err) { error = err }
      expect(error.message).to.equal('redirect_limit')
      expect(stub.callCount).to.equal(5)
      expect(stub.firstCall.args[1]).to.include({ proxy: false, maxRedirects: 0, maxContentLength: 2097152 })
      stub.resetBehavior()
      stub.resolves({ status: 200, headers: {}, data: Buffer.alloc(5) })
      try { await manager.request('https://example.org/feed', 4) } catch (err) { error = err }
      expect(error.message).to.equal('response_too_large')
      stub.rejects(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      try { await manager.request('https://example.org/feed') } catch (err) { error = err }
      expect(error.message).to.equal('request_timeout')
      stub.resetBehavior()
      stub.onFirstCall().resolves({ status: 302, headers: { location: 'http://127.0.0.1:9/' }, data: Buffer.alloc(0) })
      const realGet = stub.wrappedMethod.bind(axios)
      stub.callsFake((url, config) => realGet(url, config))
      stub.resetHistory()
      stub.onFirstCall().resolves({ status: 302, headers: { location: 'http://127.0.0.1:9/' }, data: Buffer.alloc(0) })
      try { await manager.request('https://example.org/feed') } catch (err) { error = err }
      expect(error.message).to.equal('request_failed_or_blocked')
    } finally { stub.restore() }
  })
  it('cancels a real continuously trickling body at absolute deadline', async () => {
    const http = require('http')
    const server = http.createServer((req, res) => {
      res.writeHead(200)
      const interval = setInterval(() => res.write('x'), 10)
      res.on('close', () => clearInterval(interval))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const get = axios.get.bind(axios)
    // Test transport only: route to disposable local fixture, bypassing SSRF agent.
    const stub = sinon.stub(axios, 'get').callsFake((url, config) => get(`http://127.0.0.1:${server.address().port}`, { ...config, httpAgent: new http.Agent() }))
    const start = Date.now()
    try {
      let error
      try { await manager.request('http://example.org', 1024, 100) } catch (err) { error = err }
      expect(error.message).to.equal('request_timeout')
      expect(Date.now() - start).to.be.lessThan(1000)
    } finally { stub.restore(); await new Promise((resolve) => server.close(resolve)) }
  })
  it('keeps emitted multi-sample segments disjoint without chain-overlap bug', () => {
    expect(manager.combineSegments([{ start: 0, end: 10, sampleIndex: 1 }, { start: 2, end: 4, sampleIndex: 2 }, { start: 5, end: 8, sampleIndex: 3 }, { start: 10, end: 12, sampleIndex: 4 }]).map((s) => s.sampleIndex)).to.deep.equal([1, 4])
    expect(() => manager.catalogResults('gpodder', [null])).to.throw('malformed_catalog')
  })
  it('handles maximum-duration alignment off main event loop', async function () {
    this.timeout(10000)
    let seed = 42
    const original = Array.from({ length: 116300 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 })
    const variant = original.slice()
    for (let i = 50000; i < 50200; i++) variant[i] = (Math.imul(variant[i], 22695477) + 1) >>> 0
    let ticked = false
    const timer = setTimeout(() => { ticked = true }, 0)
    try {
      for (const length of [29075, 58150, 116300]) {
        const a = original.slice(0, length)
        const b = a.slice()
        const slot = Math.floor(length / 2)
        for (let i = slot; i < slot + 200; i++) b[i] = (Math.imul(b[i], 22695477) + 1) >>> 0
        const start = Date.now()
        const result = await manager.alignAsync(a, b)
        expect(result.segments, `${length}: ${result.reason}`).to.have.length(1)
        expect(Date.now() - start).to.be.lessThan(5000)
      }
      expect(ticked).to.equal(true)
    } finally { clearTimeout(timer) }
  })
  it('roundtrips JSON through SQLite and episode API serialization', async () => {
    const { Sequelize } = require('sequelize')
    const Episode = require('../../../server/models/PodcastEpisode')
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    const podcast = sequelize.define('podcast', {})
    Episode.init(sequelize)
    await sequelize.sync()
    const dir = await fs.promises.mkdtemp(Path.join(os.tmpdir(), 'abs-dai-db-'))
    try {
      const path = Path.join(dir, 'source')
      await fs.promises.writeFile(path, 'playback')
      const stat = await fs.promises.stat(path)
      const audioFile = { metadata: { path }, duration: 200 }
      const parent = await podcast.create()
      const data = { version: 1, status: 'candidates', sourceSignature: manager.signature(audioFile), sourceStat: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`, sourceSha256: await manager.sha256(path), segments: [{ start: 10, end: 20, origin: 'dai', status: 'candidate', sampleIndex: 1 }] }
      const created = await Episode.create({ title: 'Episode', audioFile, chapters: [], podcastId: parent.id, extraData: { guid: 'keep', adAnalysis: data } })
      const loaded = await Episode.findByPk(created.id)
      expect(loaded.extraData).to.deep.equal({ guid: 'keep', adAnalysis: data })
      expect(loaded.toOldJSON('item').adAnalysis.segments).to.deep.equal(data.segments)
      expect(loaded.toOldJSONExpanded('item').adAnalysis.sourceSha256).to.equal(data.sourceSha256)
      await fs.promises.writeFile(path, 'changed')
      expect(loaded.toOldJSON('item').adAnalysis.status).to.equal('stale')
    } finally { await sequelize.close(); await fs.promises.rm(dir, { recursive: true, force: true }) }
  })
  it('invalidates replaced source and exposes no paths', async () => {
    const dir = await fs.promises.mkdtemp(Path.join(os.tmpdir(), 'abs-dai-test-'))
    try {
      const path = Path.join(dir, 'source')
      await fs.promises.writeFile(path, 'original')
      const stat = await fs.promises.stat(path)
      const episode = { audioFile: { metadata: { path } }, extraData: {} }
      episode.extraData.adAnalysis = { sourceSignature: manager.signature(episode.audioFile), sourceStat: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`, segments: [{ start: 2, end: 3 }], sourceSha256: await manager.sha256(path) }
      expect(JSON.stringify(manager.publicResult(episode))).not.to.include(path)
      await fs.promises.writeFile(path, 'replacement')
      expect(manager.publicResult(episode).status).to.equal('stale')
      expect(manager.publicResult(episode).segments).to.deep.equal([])
    } finally { await fs.promises.rm(dir, { recursive: true, force: true }) }
  })
  it('real native fingerprints cover >120 s and preserve exact playback bytes', async function () {
    this.timeout(120000)
    if (!process.env.FPCALC_PATH || !process.env.FFMPEG_PATH) this.skip()
    const dir = await fs.promises.mkdtemp(Path.join(os.tmpdir(), 'abs-dai-native-'))
    const previousMetadata = global.MetadataPath
    global.MetadataPath = dir
    try {
      // Deterministic voiced harmonic bursts with changing pitch/formants. No external audio.
      const rate = 11025
      const duration = 200
      const pcm = Buffer.alloc(rate * duration * 2)
      for (let i = 0; i < rate * duration; i++) {
        const t = i / rate
        const syllable = Math.floor(t * 5)
        const pitch = 85 + ((syllable * 7919) % 130)
        const envelope = Math.sin(Math.PI * ((t * 5) % 1)) ** 2
        let value = 0
        for (let h = 1; h <= 18; h++) value += Math.sin(2 * Math.PI * pitch * h * t) * Math.exp(-Math.abs(pitch * h - (500 + syllable % 9 * 170)) / 600) / h
        pcm.writeInt16LE(Math.max(-32767, Math.min(32767, value * envelope * 16000)), i * 2)
      }
      const raw = Path.join(dir, 'fixture.pcm')
      await fs.promises.writeFile(raw, pcm)
      for (const outputRate of [22050, 44100]) {
        const path = Path.join(dir, `original${outputRate}.wav`)
        execFileSync(process.env.FFMPEG_PATH, ['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, '-ar', String(outputRate), path])
        const hash = await manager.sha256(path)
        const original = await manager.fingerprint(path, dir, `a${outputRate}`, duration)
        expect(original.length * PERIOD).to.be.greaterThan(190)
        const silence = Path.join(dir, `silence${outputRate}.wav`)
        execFileSync(process.env.FFMPEG_PATH, ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=11025:cl=mono', '-t', '60', silence])
        const silentPrint = await manager.fingerprint(silence, dir, `silent${outputRate}`, 60)
        expect(align(original, silentPrint).segments).to.deep.equal([])
        expect(align(silentPrint, silentPrint).segments).to.deep.equal([])
        if (outputRate === 22050) {
          const Database = require('../../../server/Database')
          const audio = await fs.promises.readFile(path)
          const episode = { id: 'ep', title: 'Episode', publishedAt: new Date('2026-01-01'), duration, audioFile: { metadata: { path }, duration }, extraData: { retained: 'yes' }, save: async () => {} }
          const item = { id: 'item', extraData: { adAnalysisEnabled: true }, media: { title: 'Show', author: 'Public Author', podcastEpisodes: [episode] } }
          const db = sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => item }))
          let audioRequests = 0
          const http = sinon.stub(axios, 'get').callsFake(async (url) => {
            let data
            if (url.includes('itunes.apple.com')) data = JSON.stringify({ results: [{ feedUrl: 'https://example.org/rss', collectionName: 'Show', artistName: null }] })
            else if (url.includes('gpodder.net')) data = JSON.stringify([{ url: 'https://example.org/rss', title: 'Show', author: null }])
            else if (url.endsWith('/rss')) data = '<rss version="2.0"><channel><title>Show</title><item><title>Episode</title><pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate><enclosure url="https://example.org/audio.wav" type="audio/wav" length="100"/></item></channel></rss>'
            else { audioRequests++; data = audio }
            return { status: 200, headers: {}, data: Buffer.isBuffer(data) ? data : Buffer.from(data) }
          })
          try {
            const worker = new manager.AdAnalysisManager()
            await worker.analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
            expect(episode.extraData.adAnalysis.route).to.equal('direct')
            expect(audioRequests).to.equal(2)
            expect(episode.extraData.retained).to.equal('yes')
            expect(episode.extraData.adAnalysis.status).to.equal('inconclusive')
            expect(episode.extraData.adAnalysis.reason).to.equal('insufficient_diversity')
            expect(episode.extraData.adAnalysis.diversity.distinctFingerprints).to.equal(1)
            expect(episode.extraData.adAnalysis.samples[2].repeatedUrl).to.equal(true)
            expect(manager.publicResult(episode).segments).to.deep.equal([])
            const previousProxy = process.env.AD_ANALYSIS_PROXY_URL
            const proxyAgents = sinon.stub(require('../../../server/utils/adAnalysisProxy'), 'agents').resolves({ httpAgent: { destroy() {} }, httpsAgent: { destroy() {} } })
            try {
              process.env.AD_ANALYSIS_PROXY_URL = 'http://gluetun:8888'
              await worker.analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
              const result = episode.extraData.adAnalysis
              expect(result.route).to.equal('vpn_proxy')
              expect(result.reason).to.equal('insufficient_diversity')
              expect(result.samples.map((sample) => sample.route)).to.deep.equal(['direct', 'direct', 'vpn_proxy', 'vpn_proxy'])
              expect(result.catalogs.every((catalog) => catalog.route === 'vpn_proxy')).to.equal(true)
              expect(proxyAgents.callCount).to.equal(5) // Two catalogs, one shared feed, two enclosures.
              expect(await manager.sha256(path)).to.equal(hash)
              proxyAgents.rejects(new Error('proxy_failed_or_blocked'))
              await worker.analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
              expect(episode.extraData.adAnalysis.status).to.equal('inconclusive')
              expect(episode.extraData.adAnalysis.catalogs.every((catalog) => catalog.reason === 'proxy_failed_or_blocked')).to.equal(true)
            } finally {
              proxyAgents.restore()
              if (previousProxy === undefined) delete process.env.AD_ANALYSIS_PROXY_URL
              else process.env.AD_ANALYSIS_PROXY_URL = previousProxy
            }
          } finally { http.restore(); db.restore() }
          // Apple exhausts only its own feed budget; nullable gpodder author still works.
          const fairEpisode = { ...episode, extraData: {}, save: async () => {} }
          const fairItem = { ...item, media: { ...item.media, podcastEpisodes: [fairEpisode] } }
          const fairDb = sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => fairItem }))
          const fetched = []
          const fairHttp = sinon.stub(axios, 'get').callsFake(async (url) => {
            fetched.push(url)
            let data
            if (url.includes('itunes.apple.com')) data = JSON.stringify({ results: [0, 1, 2, 3, 4].map((n) => ({ feedUrl: `https://example.org/miss${n}`, collectionName: 'Show', artistName: 'Public Author' })) })
            else if (url.includes('gpodder.net')) data = JSON.stringify([{ url: 'https://example.org/hit', title: 'Show', author: null }])
            else if (url.endsWith('/hit')) data = '<rss version="2.0"><channel><title>Show</title><item><title>Episode</title><pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate><enclosure url="https://example.org/broken"/></item></channel></rss>'
            else if (url.endsWith('/broken')) throw new Error('broken sample')
            else data = '<rss version="2.0"><channel><title>Show</title></channel></rss>'
            return { status: 200, headers: {}, data: Buffer.from(data) }
          })
          try {
            await new manager.AdAnalysisManager().analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
            expect(fetched.filter((url) => url.includes('/miss'))).to.have.length(2)
            expect(fetched).to.include('https://example.org/hit')
            expect(fairEpisode.extraData.adAnalysis.samples.find((s) => s.origin === 'gpodder').status).to.equal('failed')
            expect(fairEpisode.extraData.adAnalysis.catalogs[1].status).to.equal('failed')
          } finally { fairHttp.restore(); fairDb.restore() }
          const cancelWorker = new manager.AdAnalysisManager()
          const cancelItem = { ...item, extraData: { adAnalysisEnabled: true } }
          const cancelDb = sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => cancelItem }))
          const cancelHttp = sinon.stub(axios, 'get').callsFake(async (url, config) => {
            cancelItem.extraData.adAnalysisEnabled = false
            cancelWorker.cancel('item')
            expect(config.signal.aborted).to.equal(true)
            throw new Error('cancelled in-flight')
          })
          try {
            await cancelWorker.analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
            expect(cancelHttp.callCount).to.equal(1)
          } finally { cancelHttp.restore(); cancelDb.restore() }
          // Full reruns compare all saved versions without catalog/audio traffic.
          const { ComparisonCorpus } = require('../../../server/utils/adComparisonCorpus')
          const corpus = new ComparisonCorpus()
          for (let n = 2; n <= 5; n++) await corpus.retain({ itemId: 'item', episodeId: 'ep', data: Buffer.from(`local fixture ${n}`), fingerprint: [n, 4, 5], duration: 60, provider: 'apple', route: 'direct' })
          const fullDb = sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => item }))
          const fullHttp = sinon.stub(axios, 'get').rejects(new Error('capacity must prevent network'))
          try {
            await new manager.AdAnalysisManager().analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
            expect(fullHttp.called).to.equal(false)
            expect(episode.extraData.adAnalysis.samples.filter((s) => s.retained)).to.have.length(5)
            expect(episode.extraData.adAnalysis.corpus.reason).to.equal('episode_limit')
          } finally { fullHttp.restore(); fullDb.restore() }
          for (const action of ['disable', 'delete', 'replace']) {
            let calls = 0
            let saves = 0
            const raceEpisode = { ...episode, extraData: {}, save: async () => { saves++ } }
            const raceItem = { ...item, extraData: { adAnalysisEnabled: true }, media: { ...item.media, podcastEpisodes: [raceEpisode] } }
            const raceDb = sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => {
              calls++
              // Initial native work completed before first catalog request checkpoint.
              if (calls >= 4) {
                if (action === 'disable') raceItem.extraData.adAnalysisEnabled = false
                if (action === 'delete') raceItem.media.podcastEpisodes = []
                if (action === 'replace') raceEpisode.audioFile = { ...raceEpisode.audioFile, duration: 201 }
              }
              return raceItem
            } }))
            const noHttp = sinon.stub(axios, 'get').rejects(new Error('must not fetch'))
            try {
              await new manager.AdAnalysisManager().analyze({ itemId: 'item', episodeId: 'ep', path, sourceSignature: manager.signature(episode.audioFile) })
              expect(noHttp.called, action).to.equal(false)
              expect(saves, action).to.equal(1)
            } finally { noHttp.restore(); raceDb.restore() }
          }
        }
        for (const [start, end] of [[480 * PERIOD, 640 * PERIOD], [1060 * PERIOD, 1260 * PERIOD]]) {
          const cut = Path.join(dir, `cut${outputRate}-${start}.pcm`)
          await fs.promises.writeFile(cut, Buffer.concat([pcm.subarray(0, start * rate * 2), pcm.subarray(end * rate * 2)]))
          const wav = `${cut}.wav`
          execFileSync(process.env.FFMPEG_PATH, ['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', cut, '-ar', String(outputRate), wav])
          const variant = await manager.fingerprint(wav, dir, `b${outputRate}-${start}`, duration - end + start)
          const comparison = align(original, variant)
          expect(comparison.segments, comparison.reason).to.have.length(1)
          expect(comparison.segments[0].start).to.be.at.least(start)
          expect(comparison.segments[0].end).to.be.at.most(end)
          expect(comparison.segments[0].end - comparison.segments[0].start).to.be.greaterThan(end - start - 12)
        }
        // Same stable host backbone, different synthetic ad creatives in each slot.
        for (const [slot, originalLength, variantLength] of [[65.137, 24, 24], [130.317, 18, 29], [130.317, 29, 18]]) {
          const creative = (seconds, salt) => {
            const buffer = Buffer.alloc(Math.round(seconds * rate) * 2)
            for (let i = 0; i < buffer.length / 2; i++) {
              const t = i / rate
              const note = Math.floor(t * 7)
              const f = 170 + ((note * salt) % 420)
              buffer.writeInt16LE(Math.round(11000 * Math.sin(2 * Math.PI * f * t) * Math.sin(Math.PI * ((t * 7) % 1)) ** 2), i * 2)
            }
            return buffer
          }
          const prints = []
          for (const [label, seconds, salt] of [['original', originalLength, 113], ['variant', variantLength, 197]]) {
            const rawSlot = Path.join(dir, `${label}-${outputRate}-${slot}-${seconds}.pcm`)
            const split = Math.round(slot * rate) * 2
            await fs.promises.writeFile(rawSlot, Buffer.concat([pcm.subarray(0, split), creative(seconds, salt), pcm.subarray(split)]))
            const wav = `${rawSlot}.wav`
            execFileSync(process.env.FFMPEG_PATH, ['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', rawSlot, '-ar', String(outputRate), wav])
            prints.push(await manager.fingerprint(wav, dir, `${label}-${outputRate}-${slot}-${seconds}`, duration + seconds))
          }
          const result = align(...prints)
          expect(result.segments, `${slot}/${originalLength}/${variantLength}: ${result.reason}`).to.have.length(1)
          expect(result.segments[0].start).to.be.at.least(slot)
          expect(result.segments[0].end).to.be.at.most(slot + originalLength)
          expect(result.segments[0].end - result.segments[0].start).to.be.greaterThan(3)
        }
        const prefix = Path.join(dir, `prefix${outputRate}.pcm`)
        await fs.promises.writeFile(prefix, pcm.subarray(160 * 1365 * 2))
        const prefixWav = `${prefix}.wav`
        execFileSync(process.env.FFMPEG_PATH, ['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', prefix, '-ar', String(outputRate), prefixWav])
        const prefixPrint = await manager.fingerprint(prefixWav, dir, `prefix${outputRate}`, duration - 160 * PERIOD)
        expect(align(original, prefixPrint).segments).to.deep.equal([])
        expect(await manager.sha256(path)).to.equal(hash)
      }
    } finally { global.MetadataPath = previousMetadata; await fs.promises.rm(dir, { recursive: true, force: true }) }
  })
})
