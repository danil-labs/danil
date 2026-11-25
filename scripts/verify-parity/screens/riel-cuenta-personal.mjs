// Riel › clic derecho en el cuadro de un workspace personal (DS1 v3: la cuenta va en el clic derecho). A diferencia
// de «riel-organizacion» (Alpha, de una organización), aquí no está «Administrar en Harness».
const open = async (page) => {
  await page.getByRole("button", { name: "Personal 1, ana@danil.ai", exact: true }).click({ button: "right", timeout: 8000 });
  await page.getByRole("menu").getByText("Personal · ana@danil.ai", { exact: true }).waitFor({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=menu]" };
