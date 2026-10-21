/**
 * Sound effects synthesized at startup. They are what the pilot hears through the own hull
 * (the hull low-pass in `Sound` muffles them further), so they are built from low thumps,
 * rumble and rattle rather than from anything that would need air to travel.
 */
export function synthesizeSounds(context: BaseAudioContext): Record<'laser' | 'explosion' | 'boost', AudioBuffer> {
  return { laser: laser(context), explosion: explosion(context), boost: boost(context) };
}

/**
 * A gate's coil pulling the ship through: the hull rings in the magnetic field, a deep thump
 * as the push lands, then a hum that climbs an octave and a fifth and shimmers out.
 */
function boost(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.round(rate * 0.9), rate);
  const data = buffer.getChannelData(0);
  let thump = 0;
  let hum = 0;
  let shimmer = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    thump += (2 * Math.PI * (48 + 90 * Math.exp(-t * 18))) / rate;
    // the hum glides from 110 Hz up to 330 Hz while the ship leaves the ring
    const glide = 110 * Math.pow(3, Math.min(1, t / 0.35));
    hum += (2 * Math.PI * glide) / rate;
    shimmer += (2 * Math.PI * glide * 4.02) / rate;
    const body = Math.sin(thump) * Math.exp(-t * 9);
    const coil = (Math.sin(hum) + 0.5 * Math.sin(hum * 2) + 0.25 * Math.sin(hum * 3)) * Math.min(1, t / 0.02) * Math.exp(-t * 3.2);
    const ring = 0.3 * Math.sin(shimmer) * Math.exp(-t * 4) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 14));
    const release = Math.min(1, (data.length - i) / (rate * 0.05));
    data[i] = 0.55 * release * (body + 0.5 * coil + ring);
  }
  return buffer;
}

/** The laser's capacitor bank discharging: a falling thump with a short electric click. */
function laser(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.round(rate * 0.45), rate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let ringPhase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const frequency = 55 + 230 * Math.exp(-t * 14);
    phase += (2 * Math.PI * frequency) / rate;
    ringPhase += (2 * Math.PI * 1150) / rate;
    const thump = Math.sin(phase) * Math.exp(-t * 7);
    const ring = 0.25 * Math.sin(ringPhase) * Math.exp(-t * 30);
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 120);
    const attack = Math.min(1, t / 0.003);
    // a short release, so the buffer does not end on a click
    const release = Math.min(1, (data.length - i) / (rate * 0.03));
    data[i] = 0.7 * attack * release * (thump + ring + 0.5 * click);
  }
  return buffer;
}

/** A blast nearby: a deep shock, rumbling hull plates and debris rattling against them. */
function explosion(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.round(rate * 2.6), rate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  let phase = 0;
  let rattle = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    brown = (brown + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    phase += (2 * Math.PI * (38 + 30 * Math.exp(-t * 6))) / rate;
    const shock = Math.sin(phase) * Math.exp(-t * 3.5);
    const rumble = brown * 6 * Math.exp(-t * 1.6);
    // debris: random knocks, getting rarer as the cloud passes
    if (Math.random() < 0.0012 * Math.exp(-t * 2.2)) rattle = 0.3 + Math.random() * 0.5;
    rattle *= 0.993;
    const knock = rattle * (Math.random() * 2 - 1);
    const attack = Math.min(1, t / 0.008);
    data[i] = Math.max(-1, Math.min(1, attack * (0.8 * shock + rumble + knock)));
  }
  return buffer;
}
