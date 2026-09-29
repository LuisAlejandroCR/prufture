// useDraftReady.ts: report screens (capture, questions, location, review) must never start an empty
// draft over the one saved on this phone. After a JS reload the in-memory draft is gone, so this hook
// first restores the persisted draft for the same task, and only starts a fresh one when there is none.

import { useEffect, useState } from "react";
import { getDraft, prepareDraft } from "./report-draft";

export function useDraftReady(taskId: string): boolean {
  const [ready, setReady] = useState(() => getDraft()?.taskId === taskId);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void prepareDraft(taskId).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready, taskId]);
  return ready;
}
