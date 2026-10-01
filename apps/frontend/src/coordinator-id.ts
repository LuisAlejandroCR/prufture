// coordinator-id.ts: the message a subscriber sends their programme team so it can add them as staff
// (PROGRAMME_STAFF_APP_USER_IDS on the api). The id is RevenueCat's anonymous app user id: no name,
// email or phone. Pure, so node --test can pin the exact text.

export function coordinatorIdMessage(appUserId: string): string {
  return `My Prufture coordinator id is ${appUserId}\nPlease ask the programme team to add it so I can review our reports.`;
}
