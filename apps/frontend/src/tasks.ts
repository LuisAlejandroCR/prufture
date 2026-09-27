// tasks.ts: presentation-only catalog turning a stored taskId into reporter-facing text (category,
// title, approximate area, what to capture). Display metadata, not protocol: the signed proof still
// carries only the raw taskId.

export type Category = "Education" | "Water and sanitation" | "Health" | "Nutrition" | "Training";

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

export interface TaskDef {
  id: string;
  category: Category;
  title: string;
  /** Approximate area name. Never an address or coordinates. */
  area: string;
  /** One sentence: why this report matters. */
  purpose: string;
  /** Photos the reporter should take, in order. */
  photos: CaptureStep[];
  questions: Question[];
  /** Rough minutes to finish. */
  minutes: number;
  /** Can the whole report be finished with no signal. Always true here. */
  offlineOk: boolean;
  /** Shown as a light urgency or progress label. */
  progressLabel?: string;
  /** True when people, faces, or documents may appear and a warning is needed. */
  peopleRisk: boolean;
}

const CATALOG: TaskDef[] = [
  {
    id: "solar-panel-install",
    category: "Education",
    title: "Check solar panels at Kalama Primary School",
    area: "Kalama District",
    purpose: "Confirm the school now has power for classroom lighting.",
    photos: [
      { prompt: "Wide photo showing all installed panels", hint: "Stand back so every panel fits in the frame." },
      { prompt: "Close photo of the equipment label", hint: "Keep it readable. Avoid any names or ID numbers." },
      { prompt: "Photo showing powered classroom lights", hint: "No faces. Point at the lights, not the people." },
    ],
    questions: [
      {
        id: "all-panels",
        text: "Were all 24 panels installed?",
        options: ["Yes", "No", "I could not confirm"],
        required: true,
      },
      {
        id: "lights-work",
        text: "Do the classroom lights turn on?",
        options: ["Yes", "No", "Not tested"],
        required: true,
      },
    ],
    minutes: 3,
    offlineOk: true,
    progressLabel: "2 more reports needed",
    peopleRisk: true,
  },
  {
    id: "water-pump-repair",
    category: "Water and sanitation",
    title: "Confirm the repaired hand pump is working",
    area: "Turkana West",
    purpose: "Confirm the community water point is back in service.",
    photos: [
      { prompt: "Wide photo of the pump and surroundings", hint: "Show the whole pump stand." },
      { prompt: "Photo of water flowing from the spout", hint: "No faces in the frame." },
    ],
    questions: [
      {
        id: "water-flows",
        text: "Does water flow when the handle is pumped?",
        options: ["Yes, steady", "Only a little", "No"],
        required: true,
      },
    ],
    minutes: 2,
    offlineOk: true,
    progressLabel: "1 more report needed",
    peopleRisk: false,
  },
  {
    id: "latrine-construction",
    category: "Water and sanitation",
    title: "Check newly built latrines at the health post",
    area: "Garissa County",
    purpose: "Confirm safe sanitation is available at the health post.",
    photos: [
      { prompt: "Wide photo of all latrine blocks", hint: "Fit every block in one frame if you can." },
      { prompt: "Photo of a handwashing point", hint: "Show the tap or water container." },
    ],
    questions: [
      {
        id: "usable",
        text: "Are the latrines finished and usable?",
        options: ["Yes", "Almost", "No"],
        required: true,
      },
    ],
    minutes: 2,
    offlineOk: true,
    peopleRisk: false,
  },
];

const DEFAULT: TaskDef = {
  id: "unknown",
  category: "Training",
  title: "Field report",
  area: "Approximate area",
  purpose: "Document what was completed at this activity.",
  photos: [{ prompt: "Photo of the completed work" }],
  questions: [],
  minutes: 2,
  offlineOk: true,
  peopleRisk: true,
};

export function listTasks(): TaskDef[] {
  return CATALOG;
}

export function getTask(id: string): TaskDef {
  return CATALOG.find((t) => t.id === id) ?? { ...DEFAULT, id: id || "unknown" };
}

/** The task Home recommends first. */
export function recommendedTask(): TaskDef {
  return CATALOG[0] ?? { ...DEFAULT };
}

export const categoryAccent: Record<Category, "education" | "water" | "health" | "nutrition" | "training"> = {
  Education: "education",
  "Water and sanitation": "water",
  Health: "health",
  Nutrition: "nutrition",
  Training: "training",
};
