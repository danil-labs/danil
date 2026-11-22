// Una tarea › enviar «Hola, agente» › el agente contesta. El motor simulado (`engine(page)` en edge-fixtures.mjs) emite,
// por el frame `events` del relay, `chat` `started` y dos `delta`: `load_session` todavía no tiene la respuesta, así
// que solo los deltas la pintan, con el turno en marcha («Detener turno»). Después guarda la respuesta y emite `done`:
// el turno termina y la caja vuelve a «Preguntar». La captura es la conversación con el turno cerrado.
// Los eventos tardan: el primer `service_poll` de la web sale antes de elegir Alpha y espera en el router
// sin contexto; los de la organización salen con el siguiente (con el reloj fijo del gate, unos 30 s; por eso los plazos de 45 s).
import { engine } from "../edge-fixtures.mjs";

const open = async (page) => {
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().click({ timeout: 8000 });
  await page.getByText("Respuesta del agente", { exact: true }).waitFor({ timeout: 8000 });
  engine(page).answerNextMessage();
  await page.getByRole("textbox", { name: "Pregunta algo · @ encargados, tareas, proyectos, archivos · / comandos", exact: true }).fill("Hola, agente");
  await page.getByRole("button", { name: "Preguntar", exact: true }).click({ timeout: 8000 });
  await page.getByText("Hola, agente", { exact: true }).waitFor({ timeout: 8000 });
  await page.getByText("Hola, Ana. Ya revisé la tarea.", { exact: true }).waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Detener turno", exact: true }).waitFor({ timeout: 8000 });
  engine(page).finishTurn();
  await page.getByRole("button", { name: "Detener turno", exact: true }).waitFor({ state: "detached", timeout: 45000 });
  await page.getByText("Hola, Ana. Ya revisé la tarea.", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open };
