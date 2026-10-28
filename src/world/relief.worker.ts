import { bakeRelief } from './rocks';

/** Bakes the relief maps of the rock shapes it is sent (see world/rocks, bakeReliefMaps) and sends each back as soon as it is done, its faces' buffers handed over, not copied. */
self.onmessage = (event: MessageEvent<number[]>) => {
  for (const index of event.data) {
    const faces = bakeRelief(index);
    self.postMessage({ index, faces }, { transfer: faces.map((face) => face.buffer) });
  }
};
