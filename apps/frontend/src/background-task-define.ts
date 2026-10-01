// background-task-define.ts: defines the background notices task. The system can start the app in the
// background just to run it, so it must be defined when the JS bundle loads; app/_layout.tsx imports
// this file first. Registering (asking the system to run it) is registerBackgroundNotices.

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { BACKGROUND_NOTICES_TASK, runBackgroundNotices } from "./background-notices";

try {
  TaskManager.defineTask(BACKGROUND_NOTICES_TASK, async () =>
    (await runBackgroundNotices()) === "success"
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed,
  );
} catch {
  // A build without the module (Expo Go): notices still run when the app opens.
}
