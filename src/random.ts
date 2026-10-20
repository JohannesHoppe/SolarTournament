/**
 * A seed from a text, e.g. a rock id, a tournament room code or a track title: FNV-1a, folded
 * into 1..2147483000, so it is never 0 (a Randomizer seeded with 0 stays at 0) and stays
 * below the Randomizer's modulus.
 */
export function textSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2147483000) + 1;
}

/**
 * Deterministic pseudo random generator (Park–Miller style with a non-Mersenne prime).
 * Every client that uses the same seed gets the same sequence, so the asteroid field
 * and asteroid fragments are identical for all players without sending them over the wire.
 */
export class Randomizer {
  private static readonly M = 2147483399;
  private static readonly A = 40692;
  private static readonly Q = Math.floor(Randomizer.M / Randomizer.A);
  private static readonly R = Randomizer.M % Randomizer.A;

  private state: number;

  constructor(seed = 0x0f0f0f0f) {
    this.state = seed;
  }

  nextInt(): number {
    const { M, A, Q, R } = Randomizer;
    this.state = A * (this.state % Q) - R * Math.floor(this.state / Q);
    if (this.state < 0) this.state += M;
    return Math.floor(this.state);
  }

  /** Value in [0, 1) with a resolution of 1e-5. */
  nextFloat(): number {
    return (this.nextInt() % 100000) / 100000;
  }

  /** Value in [min, max). */
  range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }
}
