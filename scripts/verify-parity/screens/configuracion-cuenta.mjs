// Configuración › Cuenta: el engrane del riel (aria-label = t("settings.title")), como lo hace la persona.
// El riel nuevo debe exponer el mismo botón con el mismo aria-label; si no, la receta falla (eso es paridad).
const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
};
export default { old: open, new: open, region: "[role=dialog]" };
