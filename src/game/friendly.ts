/**
 * Friendly fire: a beam, a torpedo and a nova hurt a ship of the own side as any other (see
 * Game.fireLaser, Torpedoes.fused, Game.novaBlast). Killing one costs the killer what the kill
 * would have earned against the other side, a nova's double too, and the announcer scolds it
 * on air. It costs alike however the ally died by the killer (a shot, a torpedo, a nova, a
 * shove into a crash, a drive plume, a ram): the victim's browser tells the others who killed
 * its ship, not how, and the killer's browser scores its own ship.
 */

/**
 * What a kill (`credit` kills: two for a nova) changes the killer's score by: the kill's points
 * (`killPoints`, a race's or a round's) against the other side, as many taken away for a ship
 * of the own side.
 */
export const killScore = (ownSide: boolean, killPoints: number, credit: number) => (ownSide ? -1 : 1) * killPoints * credit;
