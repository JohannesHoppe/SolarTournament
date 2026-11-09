import { msg } from '../i18n/i18n';
import type { ArenaId } from '../world/arenas';

/**
 * What the campaign's places hide for a Host who looks (docs/campaign/STORY.md, "Something to
 * collect"): at each of them three black boxes of the dead, each with its pilot's name and last
 * words, and one data chip with a track of Radio 2584. Where they lie is seeded by the place and
 * laid on its field (see campaign/hunt); this is only what they are, kept light so the radio page
 * can read the chips found without the game.
 */

/** The places with something hidden, in the story's order: every arena the campaign's jobs fly in (the side trips last), each reached once its first job is done. */
export const HUNT_PLACES = ['boneyard', 'rheasilvia', 'occator', 'wall', 'phobos', 'callisto', 'europa', 'io', 'ganymede', 'titan', 'enceladus', 'iapetus', 'rings', 'miranda', 'triton', 'derelict', 'pluto', 'haumea', 'eris', 'lantern', 'granary', 'hole', 'ballroom', 'mercury', 'venus'] as const satisfies readonly ArenaId[];
export type HuntPlace = (typeof HUNT_PLACES)[number];
/** Whether an arena is a place with something hidden. */
export const isHuntPlace = (arena: string): arena is HuntPlace => (HUNT_PLACES as readonly string[]).includes(arena);

/** The campaign Lot 7731 as the browser keeps it (see campaign/campaign); the radio page reads its chips found from it. */
export const CAMPAIGN_KEY = 'solartournament.campaign';

/** Black boxes hidden at each place. */
export const TAGS_PER_PLACE = 3;

/** What the families pay through the yardmaster once a place's black boxes are all found (☉, before the yard's cut). */
export const FAMILIES_PAY = 300;

/** A black box of the dead: who flew (a name, never translated), what they were, and their last words. */
export interface Tag {
  name: string;
  role: string;
  words: string;
}

const PILOT = msg('clone pilot of the Games');
const MINER = msg('Rockborn miner');
const HAULER = msg('hauler');
const SMUGGLER = msg('smuggler');
const NAVY = msg('Navy pilot');
const TUG = msg('tug crew');
const LOOSE = msg('one of the Loose');
const DEBTOR = msg('debtor');
const SALVAGER = msg('salvager');
const CLERK = msg('Ministry clerk');
const FEEDER = msg('Feeder pilot');
const SETTLER = msg('settler');
const RACER = msg('racer');
const COURIER = msg('courier');

/** The black boxes of each place, three each (see TAGS_PER_PLACE). */
export const TAGS: Record<HuntPlace, readonly Tag[]> = {
  boneyard: [
    { name: 'Vela Okonkwo-Brandt', role: DEBTOR, words: msg('Rask says the next print is free. He said that about the last one too.') },
    { name: 'Tomasz Ilunga', role: SALVAGER, words: msg('If you find this, the crane did it. Not me. Tell Rask the crane did it.') },
    { name: 'Juniper Saal', role: PILOT, words: msg('Forty thousand hulls, and I picked the one with the loose canopy.') },
  ],
  rheasilvia: [
    { name: 'Odile Varga-Ng', role: MINER, words: msg('The claim was ours. Write that down somewhere. The claim was ours.') },
    { name: 'Haru Mbeki', role: HAULER, words: msg('The ore is paid for. Tell my sister the ore is paid for.') },
    { name: 'Brann Aguilar', role: msg('claim-jumper'), words: msg('Should have brought a bigger saw.') },
  ],
  occator: [
    { name: 'Mireille Osei', role: msg('market trader'), words: msg('Three crates of salt, one crate of oranges. The oranges were for my kids.') },
    { name: 'Kasimir Tahi', role: SMUGGLER, words: msg('Tell the Ministry nothing. Tell my mother I was a dentist.') },
    { name: 'Ana-Lucía Petrov', role: COURIER, words: msg('Late again. They will dock my pay. Good luck docking it now.') },
  ],
  wall: [
    { name: 'Ezra Nwosu', role: msg('refugee'), words: msg('Forty of us in the hold. If the light finds us, it finds all of us.') },
    { name: 'Greta Lindqvist-Amadi', role: msg('wall guard'), words: msg('They said the lights keep the bad people out. Nobody said which side they were on.') },
    { name: 'Desmond Koh', role: SMUGGLER, words: msg('One more run, and I buy the bar on Ceres. Just one more.') },
  ],
  phobos: [
    { name: 'Ines Barrow-Kato', role: NAVY, words: msg('Clone forty-one. I do not remember thirty-nine. That is probably for the best.') },
    { name: 'Rafe Duchamp', role: PILOT, words: msg('Stickney Grand, lap three, and the rim came up faster than the podium.') },
    { name: 'Pilar Achterberg', role: NAVY, words: msg('Requesting permission to stop. Request denied. Of course.') },
  ],
  callisto: [
    { name: 'Lio Fairweather', role: LOOSE, words: msg('No Host, no printer, no second try. Worth it. Every minute of it.') },
    { name: 'Martha Quaye', role: TUG, words: msg('Tell Lanes Watch the bandits were very polite.') },
    { name: 'Sven Abiodun', role: msg('bounty hunter'), words: msg('The ratings were up. The hull was down. You cannot have both.') },
  ],
  europa: [
    { name: 'Noor Halvorsen', role: msg('scientist'), words: msg('There is something under the ice. I am sure of it. Someone else will have to be sure next.') },
    { name: 'Kip Mendez-Lowe', role: msg('tanker crew'), words: msg('The dose meter says no. The dose meter always says no.') },
    { name: 'Amara Fitzgerald', role: HAULER, words: msg('Cold. Just cold. Nobody tells you it is mostly cold.') },
  ],
  io: [
    { name: 'Bao Szabo', role: msg('sulfur miner'), words: msg('Seventeen years down here, and it still smells of rotten eggs.') },
    { name: 'Yusra Kowalczyk', role: RACER, words: msg('The tube is singing. Listen. Is it not beautiful? Is it not—') },
    { name: 'Teo Rangi', role: msg('sulfur miner'), words: msg('The link is going. If my Host hears this: sorry about the mess in your head.') },
  ],
  ganymede: [
    { name: 'Wren Halloran', role: TUG, words: msg('Block forty-two had it in for me. I always said so.') },
    { name: 'Moss Adeyemi', role: LOOSE, words: msg('Jack says the Loose die once, and that is the deal. Good deal. I would take it again.') },
    { name: 'Celeste Ivanova-Park', role: DEBTOR, words: msg('Paid off. Today. I paid it off today.') },
  ],
  titan: [
    { name: 'Gunnar Oyelaran', role: PILOT, words: msg('The haze looks soft. It is not.') },
    { name: 'Delphine Mwangi', role: RACER, words: msg('Victory Cola, refreshing the system! They made me say it. Even now.') },
    { name: 'Ottilie Chen', role: HAULER, words: msg('Methane rain on the canopy. Like home. I never had a home like this.') },
  ],
  enceladus: [
    { name: 'Paavo Achebe', role: msg('yacht crew'), words: msg('The guests wanted to touch a plume. The guests are fine. I am less fine.') },
    { name: 'Rosa Thiessen', role: SMUGGLER, words: msg('It is snowing upwards. Nobody is going to believe me.') },
    { name: 'Ike Varela', role: PILOT, words: msg('A sponsor break before the next print? Make it a good one.') },
  ],
  iapetus: [
    { name: 'Hollis Aminu', role: CLERK, words: msg('Form nine nine four, death in service. I filed it in advance. Very efficient.') },
    { name: 'Saskia Morel', role: SALVAGER, words: msg('Half the moon is black and half is white. I came down on the wrong half.') },
    { name: 'Danilo Kruger', role: LOOSE, words: msg('The cache is under the ridge. Tell nobody. Not even me.') },
  ],
  rings: [
    { name: 'Calloway Sato', role: PILOT, words: msg('Tremendous crowd tonight. Shame about the ice.') },
    { name: 'Ingrid Okafor', role: PILOT, words: msg('Freedom through Games. Freedom through Games. Freedom—') },
    { name: 'Benedikt Asante', role: HAULER, words: msg('Twenty years hauling ice past the Games, and never once a ticket.') },
  ],
  miranda: [
    { name: 'Nell Okoro', role: LOOSE, words: msg('Twenty kilometres of cliff, and I still found the bottom.') },
    { name: 'Tavish Brennan', role: NAVY, words: msg('Sweep complete. Nobody home. Nobody but—') },
    { name: 'Mina Lazarescu', role: LOOSE, words: msg('My Host never knew I lived on. I hope she lives as well as I did.') },
  ],
  triton: [
    { name: 'Ferro Quintero', role: NAVY, words: msg('Memorial duty. Polishing a wreck for a war nobody remembers.') },
    { name: 'Lucía Andersen-Obi', role: COURIER, words: msg('The geyser threw me, just as the briefing said. Nobody reads the briefing.') },
    { name: 'Basil Nakashima', role: NAVY, words: msg('We fired on the big ship because we were told to. I want that on the record.') },
  ],
  derelict: [
    { name: 'Hale Morrow', role: msg('crew of the PAAA 01'), words: msg('We were nearly out. We could already see the dark between the stars.') },
    { name: 'Ottoline Yeboah', role: PILOT, words: msg('The first Memorial Games. Fight around it, they said, and never look inside.') },
    { name: 'Fenna de Wit', role: SALVAGER, words: msg('Nobody is allowed in here. So nobody saw me. So nobody will come.') },
  ],
  pluto: [
    { name: 'Sigrun Mbatha', role: FEEDER, words: msg('Tell the hole I am not coming. It can eat comets.') },
    { name: 'Remy Castellanos', role: SETTLER, words: msg('A beachfront plot on the Ninth. It says so right here. Warm seas.') },
    { name: 'Yaw Lindgren', role: COURIER, words: msg('The last light before the dark. They named it well.') },
  ],
  haumea: [
    { name: 'Dagny Obuya', role: msg('depot crew'), words: msg('The moon turns every four hours. I have been dizzy for eleven years.') },
    { name: 'Florin Akande', role: RACER, words: msg('The inside line through the ring! The inside— oh.') },
    { name: 'Paloma Weiss', role: HAULER, words: msg('Rung one, rung two, rung three. Never saw the top of the ladder.') },
  ],
  eris: [
    { name: 'Corwin Abara', role: msg('fuel barge crew'), words: msg('The fuel made it. Write that down. The fuel made it.') },
    { name: 'Hedy Nakamura', role: msg('scavenger'), words: msg('Scavenging is honest work. Mostly. Some of the time.') },
    { name: 'Ludo Fenwick', role: CLERK, words: msg('Ninety times as far from the sun as Earth, and they still want the form in triplicate.') },
  ],
  lantern: [
    { name: 'Esperanza Volkov', role: SETTLER, words: msg('We sold the house for a plot on the Ninth. It is a lovely brochure.') },
    { name: 'Arlo Mensah', role: SETTLER, words: msg('Dear Mum. The sea is warm and blue. I will write again when we land.') },
    { name: 'Tamsin Ruiz', role: SETTLER, words: msg('If it is a hole, why does it glow? Holes do not glow, love.') },
  ],
  granary: [
    { name: 'Kwame Sorensen', role: FEEDER, words: msg('We push the comets in, and the hole shines for the broadcast. Somebody has to.') },
    { name: 'Brigid Toure', role: FEEDER, words: msg('A sensor cone. Blue light. That is the last thing. Blue light.') },
    { name: 'Nils Adebayo-Grant', role: TUG, words: msg('Ice for the Ninth. It is always hungry.') },
  ],
  hole: [
    { name: 'Seo-yeon Dubois', role: FEEDER, words: msg('Time runs slow down here. That is nice. I will take slow.') },
    { name: 'Matthias Oduya', role: SETTLER, words: msg('Where are the warm seas? Where are the—') },
    { name: 'Imre Balogun', role: NAVY, words: msg('Orders were to watch it. Nobody said what to do when it watched back.') },
  ],
  ballroom: [
    { name: 'Clementine Ward', role: CLERK, words: msg('The President waved at me. At me. I will never wash this glove.') },
    { name: 'Obi Lindberg', role: PILOT, words: msg('Parade formation, slot four. Smile for Earth.') },
    { name: 'Augusta Feld', role: msg('waiter'), words: msg('Champagne on the left, gel on the right. Do not mix them up again.') },
  ],
  mercury: [
    { name: 'Rashid Hollander', role: msg('sun miner'), words: msg('Noon is coming. Noon always comes.') },
    { name: 'Ilka Moreau', role: msg('sun miner'), words: msg('The glare in my eyes, a thousand degrees under my boots. Best job I ever had.') },
    { name: 'Ziggy Abernathy', role: RACER, words: msg('A personal best on the Terminator Run! Tell them— no, wait, the sun is—') },
  ],
  venus: [
    { name: 'Pearl Ostrowski', role: msg('Victory Cola chemist'), words: msg('The secret formula is mostly acid. Do not tell marketing.') },
    { name: 'Hamid Lund', role: RACER, words: msg('Under the deck the paint goes first. Then the rest.') },
    { name: 'Coco Ferreira', role: msg('gardener'), words: msg('Tomatoes in biodome six. Water them on Tuesdays.') },
  ],
};

/**
 * The track on each place's data chip: a title of Radio 2584 (its seed, see music/songs), made of
 * the station's own title words (TITLE_FIRST and TITLE_SECOND in music/lines, which its voice
 * can say), chosen for the place. Titles are names: never translated.
 */
export const CHIPS: Record<HuntPlace, string> = {
  boneyard: 'Dead Factory',
  rheasilvia: 'Asteroid Riot',
  occator: 'Neon Frenzy',
  wall: 'Solar Wall',
  phobos: 'Slingshot Circus',
  callisto: 'Vacuum Static',
  europa: 'Hull Pressure',
  io: 'Ion Pulse',
  ganymede: 'Tungsten Engine',
  titan: 'Burn Overdrive',
  enceladus: 'Sponsor Hoax',
  iapetus: 'Printed Decree',
  rings: 'Kessler Damage',
  miranda: 'Clone Breach',
  triton: 'Tremendous Sermon',
  derelict: 'Orange Massacre',
  pluto: 'Perihelion Terror',
  haumea: 'Orbit Mantra',
  eris: 'Cheap Dividend',
  lantern: 'Golden Empire',
  granary: 'Comet Stampede',
  hole: 'Gravity Collapse',
  ballroom: 'Presidential Ballroom',
  mercury: 'Solar Meltdown',
  venus: 'Victory Jackpot',
};

/** A black box's id as the campaign keeps it: its place and its number there (0 to 2). */
export const tagId = (place: HuntPlace, index: number) => `${place}:${index}`;

/** Every black box's id, place by place. */
export const TAG_IDS: readonly string[] = HUNT_PLACES.flatMap((place) => Array.from({ length: TAGS_PER_PLACE }, (_, index) => tagId(place, index)));

/** A black box by its id, with its place; null for an id no place has. */
export function tagOf(id: string): { place: HuntPlace; tag: Tag } | null {
  const [place, index] = id.split(':');
  return TAG_IDS.includes(id) && isHuntPlace(place) ? { place, tag: TAGS[place][Number(index)] } : null;
}

/** The chips' titles found, in the story's order of their places, from the campaign as the browser keeps it (its `chips`); none for anything it cannot read. */
export function chipsFound(text: string | null): string[] {
  try {
    const kept = JSON.parse(text ?? 'null') as { chips?: unknown } | null;
    const chips = Array.isArray(kept?.chips) ? kept.chips : [];
    return HUNT_PLACES.filter((place) => chips.includes(place)).map((place) => CHIPS[place]);
  } catch {
    return [];
  }
}
