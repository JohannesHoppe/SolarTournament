import { runJob, type FractureJob } from './fracture';

/** Cuts the pieces it is asked for (see world/fracture, prefetch), one job after the other, and sends each piece back as soon as it is cut. */
self.onmessage = (event: MessageEvent<FractureJob>) => {
  runJob(event.data, (message, transfer) => self.postMessage(message, { transfer }));
};
