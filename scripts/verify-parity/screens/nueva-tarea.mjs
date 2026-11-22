// «Nueva tarea» desde el riel o el inicio, con el compositor abierto.
const open = async (page) => {
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).first().click({ timeout: 8000 });
  await page.getByText("¿Qué hacemos hoy?", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open };
