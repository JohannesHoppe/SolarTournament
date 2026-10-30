import { bakeMilkyWay } from './milkyway';

/** Bakes the faces of the Milky Way's cube map it is sent, at the size it is sent (see world/milkyway, bakeMilkyWayTexture), and sends them back, their buffers handed over, not copied. */
self.onmessage = (event: MessageEvent<{ size: number; faces: number[] }>) => {
  const faces = bakeMilkyWay(event.data.size, event.data.faces);
  self.postMessage(faces, { transfer: faces.map((face) => face.buffer) });
};
