// items.ts: catalog of field items a reporter can verify, grouped by UNICEF programme area. Each item
// says what to photograph (with a privacy hint) and asks 1-2 closed questions. Sources: U-Report
// themes, JMP WASH-in-schools core questions, UNICEF Supply cold-chain install checklist, kit checks.

export type Category =
  | "Education"
  | "Water and sanitation"
  | "Health"
  | "Nutrition"
  | "Child protection"
  | "Climate";

export const CATEGORIES: Category[] = [
  "Education",
  "Water and sanitation",
  "Health",
  "Nutrition",
  "Child protection",
  "Climate",
];

export interface CaptureStep {
  /** Short instruction shown above the camera. */
  prompt: string;
  /** One-line privacy or framing hint. */
  hint?: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  required: boolean;
}

export interface ItemDef {
  id: string;
  category: Category;
  /** Noun phrase the reporter picks from a list, e.g. "Hand pump or water point". */
  name: string;
  /** Sentence-case action used as a report title, e.g. "Check a hand pump". */
  action: string;
  /** One sentence: why this report matters. */
  purpose: string;
  photos: CaptureStep[];
  questions: Question[];
  minutes: number;
  /** True when people, faces, or documents may appear and a warning is needed. */
  peopleRisk: boolean;
}

const NOT_SURE = "I could not confirm";
const NO_FACES = "No faces in the frame.";

export const ITEMS: ItemDef[] = [
  // Education
  {
    id: "school-solar",
    category: "Education",
    name: "School solar power",
    action: "Check school solar power",
    purpose: "Confirm the school has working power for lights and learning.",
    photos: [
      { prompt: "Wide photo showing all installed panels", hint: "Stand back so every panel fits in the frame." },
      { prompt: "Close photo of the battery or inverter label", hint: "Keep it readable. Avoid names or ID numbers." },
      { prompt: "Photo of classroom lights switched on", hint: "Point at the lights, not the people." },
    ],
    questions: [
      { id: "all-panels", text: "Are all the panels installed and connected?", options: ["Yes", "Partly", "No", NOT_SURE], required: true },
      { id: "lights-work", text: "Do the classroom lights turn on?", options: ["Yes", "No", "Not tested"], required: true },
    ],
    minutes: 3,
    peopleRisk: true,
  },
  {
    id: "classroom",
    category: "Education",
    name: "Classroom built or repaired",
    action: "Check a classroom",
    purpose: "Confirm the classroom is finished and safe to learn in.",
    photos: [
      { prompt: "Wide photo of the outside of the classroom", hint: "Show the roof and walls." },
      { prompt: "Photo inside showing desks and the board", hint: "Take it when the room is empty." },
    ],
    questions: [
      { id: "complete", text: "Are the roof, doors and windows finished?", options: ["Yes", "Partly", "No"], required: true },
      { id: "in-use", text: "Is the classroom being used for lessons?", options: ["Yes", "No", NOT_SURE], required: true },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  {
    id: "learning-kit",
    category: "Education",
    name: "School-in-a-box or learning kit",
    action: "Check a learning kit",
    purpose: "Confirm learning materials arrived complete and are in use.",
    photos: [
      { prompt: "Photo of the kit box and its label", hint: "Avoid names on delivery papers." },
      { prompt: "Photo of the contents laid out", hint: NO_FACES },
    ],
    questions: [
      { id: "complete", text: "Are all the items in the kit present?", options: ["Yes", "Some missing", NOT_SURE], required: true },
      { id: "in-use", text: "Are the materials being used?", options: ["Yes", "Not yet", NOT_SURE], required: false },
    ],
    minutes: 2,
    peopleRisk: false,
  },
  {
    id: "ecd-kit",
    category: "Education",
    name: "Early childhood (ECD) kit",
    action: "Check an early childhood kit",
    purpose: "Confirm young children have play and learning materials.",
    photos: [
      { prompt: "Photo of the kit box and its label", hint: "Avoid names on delivery papers." },
      { prompt: "Photo of the toys and materials laid out", hint: "No children in the frame." },
    ],
    questions: [
      { id: "complete", text: "Are all the items in the kit present?", options: ["Yes", "Some missing", NOT_SURE], required: true },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  // Water and sanitation (JMP core questions)
  {
    id: "water-point",
    category: "Water and sanitation",
    name: "Hand pump or water point",
    action: "Check a water point",
    purpose: "Confirm the community water point is in service.",
    photos: [
      { prompt: "Wide photo of the pump or tap and surroundings", hint: "Show the whole stand." },
      { prompt: "Photo of water flowing", hint: NO_FACES },
    ],
    questions: [
      { id: "water-flows", text: "Is water available from it today?", options: ["Yes, steady", "Only a little", "No"], required: true },
    ],
    minutes: 2,
    peopleRisk: false,
  },
  {
    id: "toilets",
    category: "Water and sanitation",
    name: "Toilet or latrine block",
    action: "Check a toilet block",
    purpose: "Confirm safe, usable sanitation is available.",
    photos: [
      { prompt: "Wide photo of the toilet block", hint: "Fit every block in one frame if you can." },
      { prompt: "Photo of a door with a lock that works", hint: "Take it when no one is using it." },
    ],
    questions: [
      { id: "usable", text: "Are the toilets finished and usable?", options: ["Yes", "Some of them", "No"], required: true },
      { id: "separate", text: "Are there separate toilets for girls?", options: ["Yes", "No", "Not a school"], required: false },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  {
    id: "handwashing",
    category: "Water and sanitation",
    name: "Handwashing station",
    action: "Check a handwashing station",
    purpose: "Confirm people can wash hands with water and soap.",
    photos: [
      { prompt: "Photo of the handwashing station", hint: "Show the tap or water container." },
      { prompt: "Close photo of the soap", hint: NO_FACES },
    ],
    questions: [
      { id: "water-soap", text: "Are water and soap both available today?", options: ["Both", "Water only", "Neither"], required: true },
    ],
    minutes: 1,
    peopleRisk: false,
  },
  // Health
  {
    id: "vaccine-fridge",
    category: "Health",
    name: "Solar vaccine fridge",
    action: "Check a vaccine fridge",
    purpose: "Confirm vaccines are kept cold so children can be immunised.",
    photos: [
      { prompt: "Photo of the fridge installed", hint: "Show the whole unit." },
      { prompt: "Close photo of the temperature display", hint: "Keep the numbers readable." },
      { prompt: "Photo of the solar panel feeding it", hint: NO_FACES },
    ],
    questions: [
      { id: "cooling", text: "Is the fridge switched on and cooling?", options: ["Yes", "No", NOT_SURE], required: true },
      { id: "temperature", text: "Does the display show between 2 and 8 °C?", options: ["Yes", "No", "No display"], required: true },
    ],
    minutes: 3,
    peopleRisk: false,
  },
  {
    id: "health-post",
    category: "Health",
    name: "Health post built or repaired",
    action: "Check a health post",
    purpose: "Confirm the health post is open and ready for patients.",
    photos: [
      { prompt: "Wide photo of the outside of the building", hint: "Show the roof and entrance." },
      { prompt: "Photo of an empty treatment room", hint: "No patients, no records." },
    ],
    questions: [
      { id: "open", text: "Is it open for services today?", options: ["Yes", "No", NOT_SURE], required: true },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  // Nutrition
  {
    id: "nutrition-supplies",
    category: "Nutrition",
    name: "Nutrition supplies at a site",
    action: "Check nutrition supplies",
    purpose: "Confirm therapeutic food and supplies reached the site.",
    photos: [
      { prompt: "Photo of the stock with a carton label visible", hint: "No registers or names." },
      { prompt: "Wide photo of the storage area", hint: NO_FACES },
    ],
    questions: [
      { id: "in-stock", text: "Are supplies in stock today?", options: ["Yes", "Running low", "No"], required: true },
      { id: "stored-well", text: "Are they stored dry and off the floor?", options: ["Yes", "No"], required: false },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  // Child protection
  {
    id: "child-friendly-space",
    category: "Child protection",
    name: "Child-friendly space",
    action: "Check a child-friendly space",
    purpose: "Confirm children have a safe place to play and learn.",
    photos: [
      { prompt: "Wide photo of the space from outside", hint: "Take it when no children are in view." },
      { prompt: "Photo of the play or learning materials", hint: "Never photograph children." },
    ],
    questions: [
      { id: "open", text: "Is the space open this week?", options: ["Yes", "No", NOT_SURE], required: true },
    ],
    minutes: 2,
    peopleRisk: true,
  },
  // Climate
  {
    id: "tree-planting",
    category: "Climate",
    name: "Tree planting site",
    action: "Check a tree planting site",
    purpose: "Confirm planted trees are growing.",
    photos: [
      { prompt: "Wide photo of the planted area", hint: "Show as many seedlings as you can." },
      { prompt: "Close photo of one seedling", hint: NO_FACES },
    ],
    questions: [
      { id: "surviving", text: "Roughly how many seedlings are alive?", options: ["Most", "About half", "Few"], required: true },
    ],
    minutes: 2,
    peopleRisk: false,
  },
  {
    id: "climate-damage",
    category: "Climate",
    name: "Flood or storm damage",
    action: "Report flood or storm damage",
    purpose: "Show where a school, clinic or water point was damaged by weather.",
    photos: [
      { prompt: "Wide photo of the damage", hint: "Stay safe. Do not enter damaged buildings." },
      { prompt: "Close photo of the worst part", hint: NO_FACES },
    ],
    questions: [
      { id: "usable", text: "Can the place still be used?", options: ["Yes", "Partly", "No"], required: true },
    ],
    minutes: 2,
    peopleRisk: false,
  },
];

export function getItem(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

/** Items grouped in catalog order, one entry per category that has items. */
export function itemsByCategory(items: ItemDef[] = ITEMS): { category: Category; items: ItemDef[] }[] {
  return CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Case-insensitive match on name, action or category. Empty query returns everything. */
export function searchItems(query: string, items: ItemDef[] = ITEMS): ItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => `${i.name} ${i.action} ${i.category}`.toLowerCase().includes(q));
}
