// Riel › «Máquinas» en Alpha: «Danil VM 2» está `stopped` y dice «Apagada». M6b: mirarla no la enciende; mientras el
// panel está abierto no sale ningún ticket hacia ella (ni con wake ni reintentos). Si sale, la receta falla.
const open = async (page) => {
  const tickets = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/v1/machines/mach_cloud_stopped/tickets") tickets.push(r.postData() ?? ""); });
  await page.getByRole("button", { name: "Alpha, ana@danil.ai", exact: true }).click({ timeout: 8000 });
  await page.getByText("Tarea de prueba", { exact: true }).first().waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Máquinas", exact: true }).click({ timeout: 8000 });
  await page.getByRole("dialog").getByText("Apagada · sin mediciones guardadas.", { exact: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(3000);
  if (tickets.length) throw new Error(`M6b: ${tickets.length} ticket(s) hacia la máquina apagada con el panel abierto: ${tickets.join(" ")}`);
};

export default { old: open, new: open, region: "[role=dialog]" };
