const { expect } = require('chai')
const sinon = require('sinon')
const http = require('http')
const https = require('https')
const tls = require('tls')
const net = require('net')
const dns = require('dns')
const fs = require('fs')
const os = require('os')
const Path = require('path')
const { execFileSync } = require('child_process')
const manager = require('../../../server/managers/AdAnalysisManager')

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const close = (server) => new Promise((resolve) => server.close(resolve))
const failure = async (promise) => { try { await promise } catch (error) { return error.message } throw new Error('expected failure') }

describe('Ad analysis proxy', () => {
  const previous = process.env.AD_ANALYSIS_PROXY_URL
  let proxy, origin, secure, dir, cert, key, targets, requests, sockets, dnsCalls, seenSni, mode
  before(() => {
    dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'abs-proxy-tls-'))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', Path.join(dir, 'key'), '-out', Path.join(dir, 'cert'), '-days', '1', '-subj', '/CN=public.example', '-addext', 'subjectAltName=DNS:public.example'], { stdio: 'ignore' })
    key = fs.readFileSync(Path.join(dir, 'key'))
    cert = fs.readFileSync(Path.join(dir, 'cert'))
  })
  after(() => fs.rmSync(dir, { recursive: true, force: true }))
  beforeEach(async () => {
    targets = []; requests = []; sockets = new Set(); dnsCalls = []; seenSni = []; mode = 'ok'
    const handler = (req, res) => {
      requests.push({ host: req.headers.host, url: req.url })
      if (mode === 'redirect') { res.writeHead(302, { Location: '/next' }); res.end() }
      else if (mode === 'private') { res.writeHead(302, { Location: 'http://private.example/' }); res.end() }
      else if (mode === 'trickle') {
        res.writeHead(200)
        const timer = setInterval(() => res.write('x'), 10)
        res.once('close', () => clearInterval(timer))
      } else res.end('fixture')
    }
    origin = http.createServer(handler)
    secure = https.createServer({ key, cert }, handler)
    secure.on('secureConnection', (socket) => seenSni.push(socket.servername))
    proxy = http.createServer()
    proxy.on('connect', (req, client, head) => {
      targets.push(req.url)
      if (mode === 'refuse') { client.end('HTTP/1.1 503 Unavailable\r\n\r\n'); return }
      if (mode === 'lost') { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); setTimeout(() => client.destroy(), 10); return }
      if (mode === 'hang') return
      const upstream = net.connect({ host: '127.0.0.1', port: req.url.endsWith(':443') ? secure.address().port : origin.address().port }, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        client.pipe(upstream).pipe(client)
      })
      sockets.add(upstream)
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
    })
    for (const server of [origin, secure, proxy]) {
      server.on('connection', (socket) => { sockets.add(socket); socket.on('error', () => {}) })
      await listen(server)
    }
    process.env.AD_ANALYSIS_PROXY_URL = `http://127.0.0.1:${proxy.address().port}`
    const lookup = dns.lookup.bind(dns)
    sinon.stub(dns, 'lookup').callsFake((host, options, callback) => {
      if (host === 'public.example' || host === 'private.example') {
        dnsCalls.push(host)
        // A second destination lookup would rebind to loopback.
        callback(null, [{ address: host === 'private.example' || dnsCalls.filter((name) => name === host).length > 1 ? '127.0.0.1' : '93.184.216.34', family: 4 }])
      } else lookup(host, options, callback)
    })
  })
  afterEach(async () => {
    sinon.restore()
    for (const socket of sockets) socket.destroy()
    await Promise.all([close(proxy), close(origin), close(secure)])
    if (previous === undefined) delete process.env.AD_ANALYSIS_PROXY_URL
    else process.env.AD_ANALYSIS_PROXY_URL = previous
  })
  it('rejects malformed or credential-bearing configuration without direct fallback', async () => {
    for (const value of ['', 'https://proxy:8888', 'http://user:secret@proxy:8888', 'http://proxy/path', 'http://proxy/?query', 'not a URL']) {
      process.env.AD_ANALYSIS_PROXY_URL = value
      expect(await failure(manager.request('http://127.0.0.1:9'))).to.equal('invalid_analysis_proxy')
    }
    expect(targets).to.deep.equal([])
    expect(requests).to.deep.equal([])
  })
  it('pins CONNECT to public literal, preserves HTTP Host, never resolves destination twice', async () => {
    const result = await manager.request('http://public.example/feed')
    expect(result.data.toString()).to.equal('fixture')
    expect(targets).to.deep.equal(['93.184.216.34:80'])
    expect(requests).to.deep.equal([{ host: 'public.example', url: '/feed' }])
    expect(dnsCalls).to.deep.equal(['public.example'])
  })
  it('pins public IPv6 literals with brackets and retains original authority', async () => {
    const result = await manager.request('http://[2606:4700:4700::1111]:8080/feed')
    expect(result.data.toString()).to.equal('fixture')
    expect(targets).to.deep.equal(['[2606:4700:4700::1111]:8080'])
    expect(requests[0].host).to.equal('[2606:4700:4700::1111]:8080')
    expect(dnsCalls).to.deep.equal([])
  })
  it('preserves original TLS SNI, certificate verification and HTTPS Host', async () => {
    const connect = tls.connect.bind(tls)
    // Trust only disposable fixture CA; production leaves native trust unchanged.
    const stub = sinon.stub(tls, 'connect').callsFake((options) => connect({ ...options, ca: cert }))
    const result = await manager.request('https://public.example/feed')
    expect(result.data.toString()).to.equal('fixture')
    expect(targets).to.deep.equal(['93.184.216.34:443'])
    expect(seenSni).to.deep.equal(['public.example'])
    expect(requests[0].host).to.equal('public.example')
    expect(stub.firstCall.args[0].rejectUnauthorized).to.equal(true)
    expect(stub.firstCall.args[0].checkServerIdentity('', { subjectaltname: 'DNS:wrong.example' })).to.be.instanceOf(Error)
  })
  it('rejects untrusted TLS certificate rather than weakening verification', async () => {
    expect(await failure(manager.request('https://public.example/feed'))).to.equal('proxy_failed_or_blocked')
    expect(requests).to.deep.equal([])
  })
  it('blocks every forbidden answer, private literals, mapped IPv6 and redirects before CONNECT', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1', '[::1]', '[::ffff:127.0.0.1]', '[fe80::1]', '[fc00::1]', '[2001:db8::1]', '[64:ff9b::7f00:1]', '[3fff::1]', '[2620:4f:8000::1]', '[2002::1]', '[100::1]', '[5f00::1]', '192.31.196.1', '192.52.193.1', '192.175.48.1', '192.0.2.1', '203.0.113.1', '240.0.0.1']) {
      expect(await failure(manager.request(`http://${address}/`)), address).to.equal('unsafe_url')
    }
    expect(targets).to.deep.equal([])
    dns.lookup.restore()
    sinon.stub(dns, 'lookup').callsFake((host, options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }]))
    expect(await failure(manager.request('http://public.example'))).to.equal('unsafe_url')
    expect(targets).to.deep.equal([])
  })
  it('revalidates redirect DNS and consent checkpoint before next connection', async () => {
    mode = 'private'
    const checkpoint = sinon.spy()
    expect(await failure(manager.request('http://public.example', 1024, 1000, undefined, checkpoint))).to.equal('unsafe_url')
    expect(targets).to.deep.equal(['93.184.216.34:80'])
    expect(dnsCalls).to.deep.equal(['public.example', 'private.example'])
    expect(checkpoint.callCount).to.equal(2)
  })
  it('rejects rebinding on same-host redirect instead of second proxy-side resolution', async () => {
    mode = 'redirect'
    expect(await failure(manager.request('http://public.example'))).to.equal('unsafe_url')
    expect(targets).to.deep.equal(['93.184.216.34:80'])
  })
  it('fails closed for refused, dead and lost proxy; never requests origin directly', async () => {
    mode = 'refuse'
    expect(await failure(manager.request('http://public.example'))).to.equal('proxy_failed_or_blocked')
    expect(requests).to.deep.equal([])
    mode = 'lost'
    expect(await failure(manager.request('https://93.184.216.34', 1024, 300))).to.equal('proxy_failed_or_blocked')
    expect(requests).to.deep.equal([])
    await close(proxy)
    expect(await failure(manager.request('http://93.184.216.34', 1024, 300))).to.equal('proxy_failed_or_blocked')
    expect(requests).to.deep.equal([])
  })
  it('bounds response bytes and absolute deadline despite trickling traffic', async () => {
    expect(await failure(manager.request('http://public.example', 2))).to.equal('response_too_large')
    mode = 'trickle'
    const start = Date.now()
    expect(await failure(manager.request('http://93.184.216.34', 1024, 100))).to.equal('request_timeout')
    expect(Date.now() - start).to.be.lessThan(1000)
  })
  it('aborts stalled CONNECT and DNS without direct fallback', async () => {
    mode = 'hang'
    const controller = new AbortController()
    const pending = manager.request('http://public.example', 1024, 1000, controller.signal)
    setTimeout(() => controller.abort(), 30)
    expect(await failure(pending)).to.equal('request_timeout')
    dns.lookup.restore()
    sinon.stub(dns, 'lookup').callsFake(() => {})
    expect(await failure(manager.request('http://public.example', 1024, 50))).to.equal('request_timeout')
    expect(requests).to.deep.equal([])
  })
})
