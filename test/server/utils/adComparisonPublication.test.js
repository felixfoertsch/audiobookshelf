const { expect } = require('chai')
const fs = require('fs').promises
const os = require('os')
const Path = require('path')
const sinon = require('sinon')
const axios = require('axios')
const Database = require('../../../server/Database')
const controller = require('../../../server/controllers/PodcastController')
const { ComparisonCorpus } = require('../../../server/utils/adComparisonCorpus')

describe('Manager comparison publication boundary', () => {
  let dir, corpus, manager, worker, item, episode, job, network, old, previousMetadata, previousEnv, cachedManager
  beforeEach(async () => {
    dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'abs-publication-'))
    previousMetadata = global.MetadataPath
    global.MetadataPath = dir
    previousEnv = { FPCALC_PATH: process.env.FPCALC_PATH, FFMPEG_PATH: process.env.FFMPEG_PATH }
    // Local executable fixture models decoder/fpcalc output; no native binaries or audio downloads.
    const binary = Path.join(dir, 'decoder')
    await fs.writeFile(binary, `#!${process.execPath}\nconst fs = require('fs'); const args = process.argv.slice(2); if (args.includes('-version')) console.log('fpcalc version 1.6.1'); else if (args.includes('-raw')) console.log(JSON.stringify({fingerprint: Array(463).fill(7)})); else fs.writeFileSync(args[args.length - 1], Buffer.alloc(60 * 22050));\n`, { mode: 0o700 })
    process.env.FPCALC_PATH = binary
    process.env.FFMPEG_PATH = binary
    const modulePath = require.resolve('../../../server/managers/AdAnalysisManager')
    cachedManager = require.cache[modulePath]
    delete require.cache[modulePath]
    manager = require(modulePath)
    worker = new manager.AdAnalysisManager()
    const path = Path.join(dir, 'original')
    await fs.writeFile(path, 'original fixture')
    episode = { id: 'episode', title: 'Episode', publishedAt: new Date('2026-01-01'), duration: 60, audioFile: { metadata: { path } }, extraData: {}, save: async () => {} }
    item = { id: 'item', extraData: { adAnalysisEnabled: true }, media: { title: 'Show', podcastEpisodes: [episode] }, save: async () => {} }
    job = { itemId: item.id, episodeId: episode.id, path, sourceSignature: manager.signature(episode.audioFile) }
    sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => item }))
    corpus = new ComparisonCorpus()
    old = await corpus.retain({ itemId: item.id, episodeId: episode.id, data: Buffer.from('old evidence'), fingerprint: [1, 2, 3], duration: 60, provider: 'apple', route: 'direct' })
    network = sinon.stub(axios, 'get').callsFake(async (url) => {
      let data
      if (url.includes('itunes.apple.com')) data = JSON.stringify({ results: [{ feedUrl: 'https://example.org/rss', collectionName: 'Show' }] })
      else if (url.endsWith('/rss')) data = '<rss version="2.0"><channel><title>Show</title><item><title>Episode</title><pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate><enclosure url="https://example.org/audio"/></item></channel></rss>'
      else if (url.endsWith('/audio')) data = 'new fixture bytes'
      else data = '[]'
      return { status: 200, headers: {}, data: Buffer.from(data) }
    })
  })
  afterEach(async () => {
    sinon.restore()
    global.MetadataPath = previousMetadata
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    const modulePath = require.resolve('../../../server/managers/AdAnalysisManager')
    if (cachedManager) require.cache[modulePath] = cachedManager
    else delete require.cache[modulePath]
    await fs.rm(dir, { recursive: true, force: true })
  })
  for (const action of ['consent', 'source', 'abort', 'success']) {
    it(`${action}: checks manager callback after real staging, preserves published evidence`, async () => {
      const retain = ComparisonCorpus.prototype.retain
      let finalChecks = 0
      let requestsAtCheck
      sinon.stub(ComparisonCorpus.prototype, 'retain').callsFake(function (input, checkpoint) {
        let checks = 0
        return retain.call(this, input, async () => {
          if (++checks === 2) {
            finalChecks++
            requestsAtCheck = network.callCount
            const entries = await fs.readdir(this.root)
            expect(entries.some((name) => name.startsWith('.stage-'))).to.equal(true)
            if (action === 'consent') await controller.setAdAnalysis({ user: { isAdminOrUp: true }, body: { enabled: false }, libraryItem: item }, { json() {} })
            if (action === 'source') await fs.writeFile(job.path, 'changed source bytes')
            if (action === 'abort') worker.cancel(item.id)
          }
          await checkpoint()
        })
      })
      await worker.analyze(job)
      expect(finalChecks).to.equal(1)
      const inventory = await corpus.inventory(item.id, episode.id)
      expect(inventory.count).to.equal(action === 'success' ? 2 : 1)
      expect(inventory.versions.some((v) => v.versionId === old.versionId)).to.equal(true)
      expect(await fs.readFile(Path.join(corpus.root, old.versionId, 'audio'), 'utf8')).to.equal('old evidence')
      expect((await fs.readdir(corpus.root)).some((name) => name.startsWith('.stage-'))).to.equal(false)
      if (action !== 'success') expect(network.callCount).to.equal(requestsAtCheck)
      else expect(episode.extraData.adAnalysis.samples.some((s) => s.collectionStatus === 'retained')).to.equal(true)
    })
  }
  it('full capacity rerun compares all five saved versions without any network', async () => {
    for (let n = 2; n <= 5; n++) await corpus.retain({ itemId: item.id, episodeId: episode.id, data: Buffer.from(`saved ${n}`), fingerprint: [n, 3, 4], duration: 60, provider: 'apple', route: 'direct' })
    await worker.analyze(job)
    expect(network.called).to.equal(false)
    expect(episode.extraData.adAnalysis.samples.filter((s) => s.retained)).to.have.length(5)
    expect(episode.extraData.adAnalysis.corpus.reason).to.equal('episode_limit')
    expect((await corpus.inventory(item.id, episode.id)).count).to.equal(5)
  })
})
