import { it } from 'vitest';
import { cometsOf, cometStart, headEnd, runDown, cometEnd } from '../game/comet';
import { testField } from '../test/field';
import { ARENAS } from '../world/arenas';
import { ARENA_LIMIT } from '../world/arena';
import { COMET_SPEED } from '../game/comet';

it('dbg', { timeout: 600000 }, () => {
  const out: string[] = [];
  for (const arena of ARENAS) {
    let comets = 0, toCenter = 0, across = 0;
    for (let round = 0; round < 12; round++) {
      const f = testField();
      f.generate(arena.layout);
      const field = f;
      for (const comet of cometsOf(arena.layout.seed, round, field.well)) {
        comets++;
        const exit = comet.at + ARENA_LIMIT / COMET_SPEED;
        for (let t = cometStart(comet); t <= Math.min(exit + 0.2, cometEnd(comet)); t += 0.1) {
          field.setClock(t);
          runDown(comet, field, t, () => {});
        }
        if (headEnd(comet) >= comet.at) toCenter++;
        if (headEnd(comet) >= exit) across++;
      }
    }
    out.push(`${arena.id} comets ${comets} reach center ${toCenter} cross ${across}`);
  }
  require('fs').writeFileSync('/private/tmp/claude-502/-Users-johanneshoppe-Work-johanneshoppe-SolarTournament/6a3f250d-2ca8-4a61-81fc-e9c3c94ceb5f/scratchpad/dbg.txt', out.join('\n'));
});
