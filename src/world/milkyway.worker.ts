import { bakeSkyPart, type SkyJob } from './milkyway';

/** Bakes the faces of the Milky Way's cube map it is sent, at the size it is sent, and the faint stars if it is asked for them (see world/milkyway, bakeSky), and sends them back, their buffers handed over, not copied. */
self.onmessage = (event: MessageEvent<SkyJob>) => {
  const part = bakeSkyPart(event.data);
  const buffers = part.faces.map((face) => face.buffer);
  if (part.faint) buffers.push(part.faint.directions.buffer, part.faint.colors.buffer, part.faint.fluxes.buffer);
  self.postMessage(part, { transfer: buffers });
};
