const { expect } = require('chai')
const fs = require('fs')
const os = require('os')
const Path = require('path')
const { execFileSync } = require('child_process')
const { align } = require('../../../server/utils/daiAlignment')
const mpeg = require('../../../server/utils/mpegFrameAlignment')
const manager = require('../../../server/managers/AdAnalysisManager')

describe('Native unanchored span safety', () => {
  it('keeps every emitted interior inside known changed audio across independent encodings', async function () {
    this.timeout(600000)
    if (!process.env.FPCALC_PATH || !process.env.FFMPEG_PATH) this.skip()
    const dir = await fs.promises.mkdtemp(Path.join(os.tmpdir(), 'abs-native-safety-'))
    const rate = 11025
    // Distinct deterministic pitches/formants per region, with syllabic envelopes.
    const voice = (seconds, region) => {
      const pcm = Buffer.alloc(seconds * rate * 2)
      let seed = region
      const tones = Array.from({ length: seconds * 5 + 1 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return { pitch: 75 + seed % 165, formant: 400 + (seed >>> 8) % 2100 }
      })
      for (let i = 0; i < seconds * rate; i++) {
        const t = i / rate
        const syllable = Math.floor(t * 5)
        const { pitch, formant } = tones[syllable]
        const envelope = Math.sin(Math.PI * ((t * 5) % 1)) ** 2
        let value = 0
        for (let h = 1; h <= 18; h++) value += Math.sin(2 * Math.PI * pitch * h * t) * Math.exp(-Math.abs(pitch * h - formant) / 600) / h
        pcm.writeInt16LE(Math.max(-32767, Math.min(32767, value * envelope * 16000)), i * 2)
      }
      return pcm
    }
    const prefix = voice(29, 1), before = voice(240, 2), after = voice(240, 3), local = voice(60, 4)
    const silence = Buffer.alloc(21 * rate * 2)
    const cases = [
      { name: 'local insertion', a: [prefix, before, local, after], b: [before, after], truth: [[269, 329]], required: true },
      { name: 'tail-only trim', a: [before, after, voice(18, 5)], b: [before, after], truth: [] },
      { name: 'equal replacement', a: [prefix, before, local, after], b: [before, voice(60, 6), after], truth: [[269, 329]] },
      { name: 'catalog-longer replacement', a: [prefix, before, voice(30, 4), after], b: [before, voice(60, 6), after], truth: [[269, 299]] },
      { name: 'unchanged programme', a: [prefix, before, local, after], b: [before, local, after], truth: [] },
      { name: 'shared silence missing anchors', a: [prefix, before, silence, after], b: [before, silence, after], truth: [] },
      { name: 'short catalog replacement', a: [prefix, before, local, after], b: [before, voice(2, 6), after], truth: [[269, 329]], required: true },
      { name: 'local silence replacing programme', a: [prefix, before, silence, after], b: [before, voice(21, 6), after], truth: [[269, 290]] },
      { name: 'anchored equal replacement', a: [before, local, after], b: [before, voice(60, 6), after], truth: [[240, 300]], required: true },
      { name: 'anchored unequal replacement', a: [before, local, after], b: [before, voice(30, 6), after], truth: [[240, 300]], required: true }
    ]
    const report = []
    try {
      for (const outputRate of [22050, 44100]) {
        for (const fixture of cases) {
          const paths = []
          const prints = []
          for (const [index, parts] of [fixture.a, fixture.b].entries()) {
            const raw = Path.join(dir, 'input.pcm')
            const path = Path.join(dir, `${outputRate}-${fixture.name}-${index}.mp3`)
            fs.writeFileSync(raw, Buffer.concat(parts))
            execFileSync(process.env.FFMPEG_PATH, ['-nostdin', '-v', 'error', '-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, '-ar', String(outputRate), '-b:a', index ? '48k' : '64k', path])
            paths.push(path)
            prints.push(await manager.fingerprint(path, dir, `print${index}`, null))
          }
          const frames = mpeg.align(mpeg.frames(fs.readFileSync(paths[0])), mpeg.frames(fs.readFileSync(paths[1])))
          expect(frames.segments, fixture.name + ': MPEG must not resolve independently encoded audio').to.deep.equal([])
          expect(frames.reason).not.to.equal('no_inserted_audio')
          const result = align(...prints)
          const spans = result.segments.map(s => {
            const truth = fixture.truth.find(([start, end]) => s.start >= start && s.end <= end)
            const region = truth || fixture.truth[0]
            return { ...s, inside: !!truth, startMinusTruth: region ? s.start - region[0] : null, endMinusTruth: region ? s.end - region[1] : null }
          })
          report.push({ rate: outputRate, case: fixture.name, reason: result.reason, truth: fixture.truth, spans })
        }
      }
      if (process.env.DAI_NATIVE_REPORT) fs.writeFileSync(process.env.DAI_NATIVE_REPORT, JSON.stringify(report, null, 2))
      for (const row of report) {
        expect(row.spans.every(s => s.inside), JSON.stringify(row)).to.equal(true)
        if (cases.find(fixture => fixture.name === row.case).required) expect(row.spans, JSON.stringify(row)).to.have.length(1)
      }
    } finally { await fs.promises.rm(dir, { recursive: true, force: true }) }
  })
})
