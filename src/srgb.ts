/** Linear light (0 to 1, clamped) as an sRGB byte: the transfer function of the sRGB standard, rounded. */
export function srgbByte(linear: number): number {
  const c = Math.min(Math.max(linear, 0), 1);
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}
