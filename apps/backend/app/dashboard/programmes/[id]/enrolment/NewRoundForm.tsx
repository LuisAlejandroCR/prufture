// NewRoundForm.tsx: "Start new round" behind a typed confirmation. A round cannot be undone and lets
// every enrolled participant report each task once more, so one stray click must not start it. The
// button stays disabled until the programme id is typed; the server action checks it again.

"use client";

import { useState } from "react";
import { newRoundConfirmed } from "../../../../../lib/enrolment";
import { newRoundAction } from "./actions";

export function NewRoundForm({ programmeId, disabled }: { programmeId: string; disabled: boolean }) {
  const [typed, setTyped] = useState("");
  const ok = newRoundConfirmed(programmeId, typed);
  return (
    <form action={newRoundAction} className="enrol-form">
      <input type="hidden" name="programmeId" value={programmeId} />
      <label htmlFor="new-round-confirm">
        Type <code>{programmeId}</code> to confirm
      </label>
      <input
        id="new-round-confirm"
        name="confirm"
        className="field"
        autoComplete="off"
        spellCheck={false}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={disabled}
      />
      <button type="submit" className="btn secondary" disabled={disabled || !ok}>
        Start new round
      </button>
    </form>
  );
}
