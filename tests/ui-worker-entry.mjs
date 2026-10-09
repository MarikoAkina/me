import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:data=>parentPort.postMessage(data)};
parentPort.on('message',data=>self.onmessage?.({data}));
await import('../lib/sql/worker.mjs');
