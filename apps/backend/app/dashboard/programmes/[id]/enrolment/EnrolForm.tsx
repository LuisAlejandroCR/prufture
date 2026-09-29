// EnrolForm.tsx: the enrol-one-commitment form. Validates in the browser with the same rule the api
// uses (isCommitment), so a typo is caught before any request; the server action checks it again.

"use client";

import { useState, type FormEvent } from "react";
import { commitmentError } from "../../../../../lib/enrolment";
import { enrolAction } from "./actions";

export function EnrolForm({ programmeId }: { programmeId: string }) {
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const value = String(new FormData(e.currentTarget).get("commitment") ?? "");
    const err = commitmentError(value);
    setError(err);
    if (err) e.preventDefault();
  }

  return (
    <form action={enrolAction} onSubmit={onSubmit} className="enrol-form" noValidate>
      <input type="hidden" name="programmeId" value={programmeId} />
      <label htmlFor="enrol-commitment">
        <strong>Identity commitment</strong>
      </label>
      <p className="muted" id="enrol-commitment-help">
        The long number shown on the participant&apos;s device. Decimal digits only.
      </p>
      <input
        id="enrol-commitment"
        name="commitment"
        className="field"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "enrol-commitment-help enrol-commitment-error" : "enrol-commitment-help"}
        onChange={() => error && setError(null)}
      />
      {error ? (
        <p id="enrol-commitment-error" className="notice attn" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn">
        Enrol participant
      </button>
    </form>
  );
}
