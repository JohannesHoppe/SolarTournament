import * as THREE from 'three';
import { atan2 } from '../detmath';
import { DOOR, EYE, inOffice, office, SPOTS } from '../world/office';
import { galley, GALLEY_DOOR, GALLEY_EYE, GALLEY_SPOTS, inGalley } from '../world/galley';
import { type Placement, Stage } from '../view/stage';
import type { Mood } from '../music/radio';

/**
 * The scenes in person (docs/campaign/STORY.md, "Holograms in flight, people in person"): for the
 * moments that count, the clone climbs out of the cockpit and stands among the people in the
 * flesh, seeing through its own eyes, and what it feels there reaches the Host. A mission steps
 * into one (see campaign/missions, `climbOut`) and its lines are then said in the room, not over
 * the comm.
 */
export type SceneName = 'office' | 'galley' | 'visit';

/** The music of a scene in person: Rask's office is quiet but for his voice; Pim's galley is the crew's good hour; Quill's visit to it is quiet. */
export const SCENE_MUSIC: Record<SceneName, Mood | null> = { office: null, galley: 'bright', visit: null };

/** Who stands where in a scene, where the clone's eyes are and which way they first look (rad about y, 0 towards -z, as a camera looks). */
export interface ScenePlan {
  people: Placement[];
  eye: THREE.Vector3;
  look: number;
}

/** The turn about y (rad) that turns a figure (facing +z) from `from` towards `to`. */
const towards = (from: THREE.Vector3, to: THREE.Vector3) => atan2(to.x - from.x, to.z - from.z);

/** Rask's office in the cab on the tower: Rask behind his desk, Hedda Kroll beside it, the clone a few steps before it looking at them, the yard beyond the glass. */
function officePlan(): ScenePlan {
  const eye = inOffice(DOOR).setY(inOffice(DOOR).y + EYE);
  const desk = inOffice(SPOTS.desk);
  const window = inOffice(SPOTS.window);
  return {
    people: [
      { who: 'rask', at: desk, facing: towards(desk, eye) },
      { who: 'hedda', at: window, facing: towards(window, eye) },
    ],
    eye,
    // a camera looks along -z at no turn: towards the desk
    look: atan2(-(desk.x - eye.x), -(desk.z - eye.z)),
  };
}

/** Patience's galley: Hedda at the head of the table, Pim at the counter, the clone by the door looking down the table to the porthole. */
function galleyPlan(): ScenePlan {
  const eye = inGalley(GALLEY_DOOR).setY(inGalley(GALLEY_DOOR).y + GALLEY_EYE);
  const head = inGalley(GALLEY_SPOTS.head);
  const counter = inGalley(GALLEY_SPOTS.counter);
  return {
    people: [
      { who: 'hedda', at: head, facing: towards(head, eye) },
      { who: 'pim', at: counter, facing: towards(counter, eye) },
    ],
    eye,
    look: atan2(-(head.x - eye.x), -(head.z - eye.z)),
  };
}

/** Commissioner Quill's visit to Patience's galley: Hedda at the head of the table, Quill at the counter where Pim stands. */
function visitPlan(): ScenePlan {
  const plan = galleyPlan();
  plan.people[1] = { ...plan.people[1], who: 'quill' };
  return plan;
}

const PLANS: Record<SceneName, () => ScenePlan> = { office: officePlan, galley: galleyPlan, visit: visitPlan };
const SETS: Record<SceneName, () => THREE.Object3D> = { office, galley, visit: galley };

/** A scene's plan. */
export const planOf = (name: SceneName) => PLANS[name]();

/** A scene's stage, built anew around its set (the set and the figures are kept between scenes). */
export function stageOf(name: SceneName): Stage {
  const { people, eye, look } = planOf(name);
  return new Stage(SETS[name](), people, eye, look);
}
