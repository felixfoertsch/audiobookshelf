const { parentPort, workerData } = require('worker_threads')
const { align } = require('./daiAlignment')
parentPort.postMessage(align(workerData.original, workerData.variant))
