// Configuración › Máquinas desde Alpha (la organización de las máquinas): «Danil VM 2» está `stopped` y dice
// «apagada». M6b: abrir la pantalla no la enciende; no sale ningún ticket hacia ella (ni con wake ni reintentos).
const open = async (page) => {
  const tickets = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/v1/machines/mach_cloud_stopped/tickets") tickets.push(r.postData() ?? ""); });
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Máquinas", exact: true }).click({ timeout: 8000 });
  await page.getByRole("dialog").getByText("VM de Danil · apagada", { exact: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(3000);
  if (tickets.length) throw new Error(`M6b: ${tickets.length} ticket(s) hacia la máquina apagada en Configuración › Máquinas: ${tickets.join(" ")}`);
};

export default { old: open, new: open, region: "[role=dialog]" };
