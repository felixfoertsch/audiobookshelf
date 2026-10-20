const { parentPort, workerData } = require('worker_threads')
const { align } = require('./daiAlignment')
const { alignFiles } = require('./mpegFrameAlignment')
parentPort.postMessage(typeof workerData.original === 'string' ? alignFiles(workerData.original, workerData.variant) : align(workerData.original, workerData.variant))
