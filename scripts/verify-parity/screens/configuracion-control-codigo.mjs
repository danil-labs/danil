const open = async (page) => {
  await page.getByRole("button", { name: "Configuración", exact: true }).first().click({ timeout: 8000 });
  await page.getByRole("tab", { name: "Control de código", exact: true }).click({ timeout: 8000 });
};

export default { old: open, new: open, region: "[role=dialog]" };
