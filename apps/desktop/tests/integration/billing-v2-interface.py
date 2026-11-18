from pathlib import Path
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4188/tests/fixtures/billing-v2-harness.html"
BROWSER = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
if not BROWSER and os.name == "nt":
    browsers = list(Path(os.environ["LOCALAPPDATA"]).joinpath("ms-playwright").glob("chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe"))
    if browsers:
        BROWSER = str(max(browsers, key=lambda path: int(path.parts[-3].rsplit("-", 1)[1])))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({"executable_path": BROWSER} if BROWSER else {}))
    page = browser.new_page()
    page.goto(BASE + "?role=member", wait_until="networkidle")
    page.get_by_text("Comprados", exact=True).wait_for()
    assert page.get_by_role("button", name="Cambiar de plan").count() == 0
    assert page.get_by_role("button", name="Cancelar suscripción").count() == 0
    page.goto(BASE + "?role=owner&payer=yes", wait_until="networkidle")
    page.get_by_role("button", name="Cambiar de plan").wait_for()
    assert page.get_by_role("button", name="Cancelar suscripción").count() == 1
    assert page.get_by_role("button", name="Abrir").count() == 1
    page.goto(BASE + "?role=owner", wait_until="networkidle")
    page.get_by_role("button", name="Mostrar más").first.click(timeout=5000)
    page.get_by_text("2026-11-22", exact=True).wait_for()
    assert "transactions:next_page" in page.evaluate("window.billingCalls")
    page.goto(BASE + "?role=owner&invoices=unavailable", wait_until="networkidle")
    page.get_by_text("Comprados", exact=True).wait_for(timeout=5000)
    assert page.get_by_text("No disponible", exact=True).count() == 1
    page.goto(BASE + "?new=1&role=member", wait_until="networkidle")
    page.get_by_role("button", name="Crear organización").click()
    page.get_by_label("Nombre de la organización").fill("Café Danil")
    page.get_by_label("Plan").select_option("team")
    page.get_by_role("button", name="Continuar al pago").click()
    page.get_by_text("Preparando el pago", exact=True).wait_for()
    assert "new:team:Café Danil" in page.evaluate("window.billingCalls")
    page.goto(BASE + "?return=success&checkout=bchk_01SYNTHETICCHK0001&result=success", wait_until="networkidle")
    page.get_by_text("Pago confirmado y plan activo", exact=True).wait_for(timeout=12000)
    assert "select:org_NEW" in page.evaluate("window.billingCalls")
    assert "checkout=" not in page.url and "result=" not in page.url
    page.goto(BASE + "?return=cancel&checkout=bchk_01SYNTHETICCHK0001&result=cancel", wait_until="domcontentloaded")
    page.get_by_text("No se completó el pago, puedes intentarlo de nuevo", exact=True).wait_for()
    page.get_by_text("Pago confirmado y plan activo", exact=True).wait_for(timeout=12000)
    assert "select:org_NEW" in page.evaluate("window.billingCalls")
    page.goto(BASE + "?return=foreign&checkout=bchk_01SYNTHETICCHK0001&result=success", wait_until="networkidle")
    page.get_by_text("No disponible", exact=True).wait_for()
    assert page.evaluate("window.billingCalls").count("checkout-status") == 1
    page.goto(BASE + "?return=cancel-paid-pending&short=1&checkout=bchk_01SYNTHETICCHK0001&result=cancel", wait_until="networkidle")
    page.wait_for_function("window.billingDeadlineElapsed === true")
    page.get_by_text("Pago confirmado, activando el plan", exact=True).wait_for(timeout=5000)
    page.goto(BASE + "?new=1&catalog=retry", wait_until="networkidle")
    page.get_by_role("button", name="Crear organización").click()
    page.get_by_label("Nombre de la organización").wait_for(timeout=5000)
    assert page.evaluate("window.billingCalls").count("catalog") == 2
    page.goto(BASE + "?gate=on", wait_until="networkidle")
    page.get_by_role("button", name="Crear organización").click()
    page.get_by_label("Nombre de la organización").wait_for(timeout=5000)
    page.goto(BASE + "?gate=off", wait_until="networkidle")
    assert page.get_by_role("button", name="Crear organización").count() == 0
    browser.close()

print("billing interface: 12 cases passed")
