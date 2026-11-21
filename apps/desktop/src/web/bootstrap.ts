import "../../../../packages/ui/src/styles/global.css";
void import("./main").catch(async error => {
  console.error(error);
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    const { prosaDe } = await import("../../../../packages/ui/src/Failure");
    root.textContent = prosaDe(error);
  }
});
