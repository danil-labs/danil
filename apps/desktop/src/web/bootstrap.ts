import "../styles/global.css";
void import("./main").catch(async error => {
  console.error(error);
  const root = document.getElementById("root");
  if (root) {
    root.setAttribute("role", "alert");
    const { prosaDe } = await import("../ui/Failure");
    root.textContent = prosaDe(error);
  }
});
