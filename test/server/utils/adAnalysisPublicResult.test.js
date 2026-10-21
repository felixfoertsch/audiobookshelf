const { expect } = require('chai')
const fs = require('fs')
const os = require('os')
const path = require('path')
const manager = require('../../../server/managers/AdAnalysisManager')
const sinon = require('sinon')
const Database = require('../../../server/Database')
const sockets = require('../../../server/SocketAuthority')

describe('ad analysis event authorization', () => {
  it('sends state only to users with current item access', async () => {
    const item = { id: 'item' }
    const allowed = sinon.spy()
    const denied = sinon.spy()
    const previous = sockets.clients
    sinon.stub(Database, 'libraryItemModel').get(() => ({ getExpandedById: async () => item }))
    sockets.clients = {
      allowed: { user: { checkCanAccessLibraryItem: (value) => value === item }, socket: { emit: allowed } },
      denied: { user: { checkCanAccessLibraryItem: () => false }, socket: { emit: denied } },
      unauthenticated: { socket: { emit: denied } }
    }
    try {
      const payload = { episodeId: 'episode', adAnalysis: { status: 'queued' } }
      await sockets.libraryItemDataEmitter('episode_ad_analysis', 'item', payload)
      expect(allowed.calledOnceWithExactly('episode_ad_analysis', payload)).to.equal(true)
      expect(denied.called).to.equal(false)
    } finally { sockets.clients = previous; sinon.restore() }
  })
})

describe('ad analysis public result', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-result-'))
  const audioFile = { metadata: { path: path.join(dir, 'audio') } }
  fs.writeFileSync(audioFile.metadata.path, 'audio')
  const episode = { id: 'episode', audioFile, extraData: {} }
  const signature = manager.signature(audioFile)
  after(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('normalizes legacy no-insertion samples', () => {
    const stat = fs.statSync(audioFile.metadata.path)
    episode.extraData.adAnalysis = { version: 1, status: 'inconclusive', reason: 'no_safe_candidates', samples: [{ status: 'no_inserted_audio' }], segments: [], sourceSignature: signature, sourceStat: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}` }
    expect(manager.publicResult(episode, 'item')).to.include({ status: 'no_difference', reason: 'no_inserted_audio' })
  })

  it('does not hide candidates or failures when another copy has no differences', () => {
    for (const status of ['candidates', 'failed', 'stale']) {
      episode.extraData.adAnalysis.status = status
      expect(manager.publicResult(episode, 'item').status).to.equal(status)
    }
  })

  it('queued or running job overrides stored result, but source mismatch is stale', () => {
    const worker = new manager.AdAnalysisManager()
    const job = { itemId: 'item', episodeId: 'episode', key: 'item:episode', sourceSignature: signature }
    worker.queue.push(job)
    const originalQueue = manager.queue
    const originalActive = manager.activeEpisodes
    const originalJobs = manager.activeJobs
    manager.queue = worker.queue
    manager.activeEpisodes = worker.activeEpisodes
    manager.activeJobs = worker.activeJobs
    try {
      expect(manager.publicResult(episode, 'item').status).to.equal('queued')
      worker.activeEpisodes.add(job.key)
      worker.activeJobs.set(job.key, job)
      expect(manager.publicResult(episode, 'item').status).to.equal('running')
      job.sourceSignature = 'changed'
      expect(manager.publicResult(episode, 'item')).to.include({ status: 'stale', reason: 'source_changed' })
    } finally {
      manager.queue = originalQueue
      manager.activeEpisodes = originalActive
      manager.activeJobs = originalJobs
    }
  })
})
