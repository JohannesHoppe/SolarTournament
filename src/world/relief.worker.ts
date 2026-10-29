import { bakeRelief, type ReliefJob, type ReliefKind } from './rocks';
import { bakeIceRelief } from './ice';
import { bakeNucleusRelief } from './nucleus';

/** How each kind of relief map is baked (see world/rocks, world/ice, world/nucleus). */
const BAKES: Record<ReliefKind, (index: number) => Uint8Array[]> = { rock: bakeRelief, ice: bakeIceRelief, nucleus: bakeNucleusRelief };

/** Bakes the relief maps it is sent, rock's, ice's and the comet nucleus's (see world/rocks, bakeReliefMaps), and sends each back as soon as it is done, its faces' buffers handed over, not copied. */
self.onmessage = (event: MessageEvent<ReliefJob[]>) => {
  for (const [kind, index] of event.data) {
    const faces = BAKES[kind](index);
    self.postMessage({ kind, index, faces }, { transfer: faces.map((face) => face.buffer) });
  }
};
