// DAI stitchers splice MPEG audio frames without re-encoding, so show content is byte-identical across copies.
// Frames of the original outside the order-preserving shared runs were inserted; edges are exact to one frame.
const fs = require('fs')
const crypto = require('crypto')
const BITRATES = [[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]]
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }
const MIN_RUN = 40 // frames (~1 s) a shared run must last
const MIN_SPAN = 2 // seconds; shorter gaps are frame noise
const MERGE = 3 // seconds; closer inserted spans are one break
const MAX_RUNS = 20000

function frames(data) {
  const hashes = []
  const times = [0]
  let i = 0
  let t = 0
  while (i + 4 <= data.length) {
    if (data[i] === 0x49 && data[i + 1] === 0x44 && data[i + 2] === 0x33 && i + 10 <= data.length) {
      i += 10 + (((data[i + 6] & 0x7f) << 21) | ((data[i + 7] & 0x7f) << 14) | ((data[i + 8] & 0x7f) << 7) | (data[i + 9] & 0x7f))
      continue
    }
    const b1 = data[i + 1]
    const b2 = data[i + 2]
    const version = (b1 >> 3) & 3
    const bitrate = b2 >> 4
    const rate = (b2 >> 2) & 3
    // Layer III only; anything else is resynchronised byte by byte.
    if (data[i] !== 0xff || (b1 & 0xe0) !== 0xe0 || version === 1 || ((b1 >> 1) & 3) !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) { i++; continue }
    const hz = RATES[version][rate]
    const size = Math.floor(((version === 3 ? 144 : 72) * BITRATES[version === 3 ? 0 : 1][bitrate] * 1000) / hz) + ((b2 >> 1) & 1)
    // 48-bit digest prefix as a number keeps 600k frames well inside the worker heap limit.
    hashes.push(crypto.createHash('md5').update(data.subarray(i, i + size)).digest().readUIntBE(0, 6))
    t += (version === 3 ? 1152 : 576) / hz
    times.push(t)
    i += size
  }
  return { hashes: Float64Array.from(hashes), times: Float64Array.from(times) }
}

// Maximal diagonal runs a[i..i+n) === b[j..j+n). Hashes repeated often in b (digital silence) seed at most 4 runs.
function runs(a, b) {
  const where = new Map()
  b.forEach((h, j) => {
    const list = where.get(h)
    if (!list) where.set(h, [j])
    else if (list.length < 4) list.push(j)
  })
  const out = []
  const covered = new Map()
  for (let i = 0; i < a.length; i++) {
    for (const j of where.get(a[i]) || []) {
      if ((covered.get(j - i) ?? -1) >= i) continue
      let n = 0
      while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n++
      covered.set(j - i, i + n)
      if (n >= MIN_RUN) out.push([i, j, n])
      if (out.length > MAX_RUNS) throw new Error('alignment_limit')
    }
  }
  return out
}

// Heaviest chain increasing in both files. Neighbouring runs may overlap a few frames (repeated silence at a seam).
function chain(segments) {
  segments.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const best = []
  for (let k = 0; k < segments.length; k++) {
    const [i, j, n] = segments[k]
    let prev = -1
    for (let p = 0; p < k; p++) {
      const [pi, pj, pn] = segments[p]
      if (pi < i && pj < j && pi + pn <= i + n && pj + pn <= j + n && (prev < 0 || best[p].weight > best[prev].weight)) prev = p
    }
    best.push({ weight: (prev < 0 ? 0 : best[prev].weight) + n, prev })
  }
  const picked = []
  let node = best.reduce((m, b, k) => (m < 0 || b.weight > best[m].weight ? k : m), -1)
  while (node >= 0) { picked.push(segments[node]); node = best[node].prev }
  return picked
}

function align(original, variant) {
  const empty = (reason, matchedSeconds = 0) => ({ reason, segments: [], matchedSeconds })
  const a = original.hashes
  if (a.length < 1000 || variant.hashes.length < 1000) return empty('not_mpeg')
  const content = new Uint8Array(a.length)
  for (const [i, , n] of chain(runs(a, variant.hashes))) content.fill(1, i, i + n)
  const shared = content.reduce((sum, c) => sum + c, 0)
  const matchedSeconds = shared * (original.times[a.length] / a.length)
  // Re-encoded or unrelated copies share few identical frames; Chromaprint handles those.
  if (shared < a.length * 0.65) return empty('insufficient_shared_audio', matchedSeconds)
  const spans = []
  let start = -1
  for (let i = 0; i <= a.length; i++) {
    if (i < a.length && !content[i]) { if (start < 0) start = i; continue }
    if (start < 0) continue
    const s = original.times[start]
    const e = original.times[i]
    if (spans.length && s - spans[spans.length - 1].end < MERGE) spans[spans.length - 1].end = e
    else spans.push({ start: s, end: e, origin: 'dai', status: 'candidate' })
    start = -1
  }
  const segments = spans.filter((s) => s.end - s.start >= MIN_SPAN)
  return { reason: segments.length ? 'candidate_insertions' : 'no_inserted_audio', segments, matchedSeconds }
}

const alignFiles = (originalPath, variantPath) => align(frames(fs.readFileSync(originalPath)), frames(fs.readFileSync(variantPath)))

module.exports = { frames, align, alignFiles }
