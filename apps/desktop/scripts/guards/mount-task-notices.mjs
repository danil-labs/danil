#!/usr/bin/env node
/** Los avisos de una tarea, recorridos en la ventana montada. */
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { boot, WITH_TASK } from "../../tests/helpers/mount-guard.mjs";
import { taskNoticeScenarios } from "../../tests/helpers/mount-task-notices.mjs";

await taskNoticeScenarios({ boot, sleep, responses: WITH_TASK });
// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
