import { bakeRelief, type ReliefJob } from './rocks';
import { bakeIceRelief } from './ice';

/** Bakes the relief maps it is sent, rock's and ice's (see world/rocks, bakeReliefMaps), and sends each back as soon as it is done, its faces' buffers handed over, not copied. */
self.onmessage = (event: MessageEvent<ReliefJob[]>) => {
  for (const [kind, index] of event.data) {
    const faces = kind === 'ice' ? bakeIceRelief(index) : bakeRelief(index);
    self.postMessage({ kind, index, faces }, { transfer: faces.map((face) => face.buffer) });
  }
};
