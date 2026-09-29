// tasks.ts: turns a stored taskId into reporter-facing text. A task is either a programme assignment
// (an item at a named place with an approximate 5-char cell) or a self-started `item:<itemId>` report
// located by the phone. Display metadata only: the signed proof still carries just the raw taskId.

import { decodeGeohashBounds } from "./geohash";
import { progressLabelFor } from "./progress";
import { getItem, type CaptureStep, type Category, type ItemDef, type Question } from "./items";

export type { CaptureStep, Category, Question } from "./items";

export interface TaskDef {
  id: string;
  /** Catalog item this task verifies. */
  itemId: string;
  category: Category;
  title: string;
  /** Approximate area name. Never an address or coordinates. */
  area: string;
  /** 5-char approximate cell for assignments; empty for self-started reports. */
  cell: string;
  /** One sentence: why this report matters. */
  purpose: string;
  /** Photos the reporter should take, in order. */
  photos: CaptureStep[];
  questions: Question[];
  /** Rough minutes to finish. */
  minutes: number;
  /** Can the whole report be finished with no signal. Always true here. */
  offlineOk: boolean;
  /** Shown as a light urgency or progress label. Derived from `confirmations`. */
  progressLabel?: string;
  /** Community confirmations the programme asked for, and how many it has. Assignments only. */
  confirmations?: { have: number; need: number };
  /** True when people, faces, or documents may appear and a warning is needed. */
  peopleRisk: boolean;
  /** True for a report the reporter started from the item catalog. */
  selfStarted: boolean;
}

export const ITEM_TASK_PREFIX = "item:";
export const SELF_STARTED_AREA = "Near you";

interface Assignment {
  id: string;
  itemId: string;
  title: string;
  area: string;
  cell: string;
  confirmations?: { have: number; need: number };
}

// Example programme assignments. In a pilot these come from the programme team; ids are stable
// because reports already saved on phones reference them.
const ASSIGNMENTS: Assignment[] = [
  {
    id: "solar-panel-install",
    itemId: "school-solar",
    title: "Check solar panels at Kalama Primary School",
    area: "Kalama, Machakos",
    cell: "kzdwb",
    confirmations: { have: 1, need: 3 },
  },
  {
    id: "water-pump-repair",
    itemId: "water-point",
    title: "Confirm the repaired hand pump is working",
    area: "Kakuma, Turkana West",
    cell: "sb8v1",
    confirmations: { have: 2, need: 3 },
  },
  {
    id: "latrine-construction",
    itemId: "toilets",
    title: "Check newly built latrines at the health post",
    area: "Garissa County",
    cell: "kzujq",
  },
  {
    id: "cold-chain-bogota",
    itemId: "vaccine-fridge",
    title: "Check the new vaccine fridge at the health centre",
    area: "Ciudad Bolívar, Bogotá",
    cell: "d2g38",
    confirmations: { have: 2, need: 3 },
  },
  {
    id: "handwashing-lima",
    itemId: "handwashing",
    title: "Check handwashing stations at the school",
    area: "San Juan de Lurigancho, Lima",
    cell: "6mc5z",
  },
];

const FALLBACK_ITEM: ItemDef = {
  id: "unknown",
  category: "Education",
  name: "Field activity",
  action: "Field report",
  purpose: "Document what was completed at this activity.",
  photos: [{ prompt: "Photo of the completed work" }],
  questions: [],
  minutes: 2,
  peopleRisk: true,
};

function fromItem(item: ItemDef, id: string): TaskDef {
  return {
    id,
    itemId: item.id,
    category: item.category,
    title: item.action,
    area: SELF_STARTED_AREA,
    cell: "",
    purpose: item.purpose,
    photos: item.photos,
    questions: item.questions,
    minutes: item.minutes,
    offlineOk: true,
    peopleRisk: item.peopleRisk,
    selfStarted: true,
  };
}

function fromAssignment(a: Assignment): TaskDef {
  const item = getItem(a.itemId) ?? FALLBACK_ITEM;
  return {
    ...fromItem(item, a.id),
    title: a.title,
    area: a.area,
    cell: a.cell,
    confirmations: a.confirmations,
    progressLabel: a.confirmations ? progressLabelFor(a.confirmations) : undefined,
    selfStarted: false,
  };
}

/** taskId for a report the reporter starts from the catalog. */
export function itemTaskId(itemId: string): string {
  return `${ITEM_TASK_PREFIX}${itemId}`;
}

export function listTasks(): TaskDef[] {
  return ASSIGNMENTS.map(fromAssignment);
}

export function getTask(id: string): TaskDef {
  if (id.startsWith(ITEM_TASK_PREFIX)) {
    const item = getItem(id.slice(ITEM_TASK_PREFIX.length));
    if (item) return fromItem(item, id);
  }
  const a = ASSIGNMENTS.find((t) => t.id === id);
  if (a) return fromAssignment(a);
  return { ...fromItem(FALLBACK_ITEM, id || "unknown"), area: "Approximate area" };
}

/** Centre of a geohash cell. */
export function cellCentre(cell: string): { latitude: number; longitude: number } {
  const b = decodeGeohashBounds(cell);
  return { latitude: (b.latMin + b.latMax) / 2, longitude: (b.lngMin + b.lngMax) / 2 };
}

/** Great-circle distance in km between two cell centres. */
export function cellDistanceKm(a: string, b: string): number {
  const p = cellCentre(a);
  const q = cellCentre(b);
  const rad = Math.PI / 180;
  const dLat = (q.latitude - p.latitude) * rad;
  const dLng = (q.longitude - p.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.latitude * rad) * Math.cos(q.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Tasks nearest the reporter's cell first; unchanged order when the cell is unknown. */
export function sortByDistance(tasks: TaskDef[], myCell: string | null): TaskDef[] {
  if (!myCell) return tasks;
  return [...tasks].sort((a, b) => cellDistanceKm(myCell, a.cell) - cellDistanceKm(myCell, b.cell));
}

/** Friendly distance: "Nearby", "12 km away", or "Far from you" past 200 km. */
export function distanceLabel(myCell: string | null, task: TaskDef): string | null {
  if (!myCell || !task.cell) return null;
  const km = cellDistanceKm(myCell, task.cell);
  if (km < 5) return "Nearby";
  if (km <= 200) return `${Math.round(km)} km away`;
  return "Far from you";
}

/** The task Home recommends first: nearest assignment when the cell is known. */
export function recommendedTask(myCell: string | null = null): TaskDef {
  return sortByDistance(listTasks(), myCell)[0] ?? fromItem(FALLBACK_ITEM, "unknown");
}

/** Icon drawn in the soft category circle. Icon names are plain strings so this module stays RN-free. */
export const categoryIcon: Record<Category, "book" | "water" | "health" | "nutrition" | "shield" | "leaf"> = {
  Education: "book",
  "Water and sanitation": "water",
  Health: "health",
  Nutrition: "nutrition",
  "Child protection": "shield",
  Climate: "leaf",
};

export const categoryAccent: Record<Category, "education" | "water" | "health" | "nutrition" | "protection" | "climate"> = {
  Education: "education",
  "Water and sanitation": "water",
  Health: "health",
  Nutrition: "nutrition",
  "Child protection": "protection",
  Climate: "climate",
};
