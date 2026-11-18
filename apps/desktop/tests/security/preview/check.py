import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=18443)
parser.add_argument("--output", required=True)
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=[
        "--no-sandbox", "--no-proxy-server", "--ignore-certificate-errors",
        f"--host-resolver-rules=MAP *.daizero.com 127.0.0.1:{args.port}, MAP beta.danil.ai 127.0.0.1:{args.port}, MAP edge.danil.ai 127.0.0.1:{args.port}",
    ])
    context = browser.new_context(ignore_https_errors=True, locale="es", viewport={"width": 1100, "height": 800})
    context.add_cookies([{"name": "__Host-danil_session", "value": "synthetic-session", "url": "https://edge.danil.ai/", "secure": True, "httpOnly": True, "sameSite": "Strict"}])
    page = context.new_page()
    page.set_default_timeout(15_000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("https://beta.danil.ai/")
    page.wait_for_load_state("networkidle")
    initial = page.evaluate("fetch('/__lab/state').then(r => r.json())")
    page.get_by_role("link", name="Servidor", exact=True).click()
    page.wait_for_selector('[data-preview-state="live"]')
    frame = page.frame_locator("iframe")
    for name in ["css", "js", "fetch", "ws"]:
        frame.locator(f'#{name}[data-state="ok"]').wait_for()
    assert page.locator('[role="dialog"]').count() == 0
    assert len(context.pages) == 1
    assert page.locator("iframe").get_attribute("sandbox") == "allow-scripts allow-same-origin allow-forms"
    assert page.locator("iframe").get_attribute("referrerpolicy") == "no-referrer"
    original_node = page.locator("iframe").element_handle()
    original_url = page.locator("iframe").get_attribute("src")
    page.screenshot(path=str(output / "preview.png"), full_page=True)
    page.wait_for_function("n => fetch('/__lab/state').then(r => r.json()).then(s => s.renewed > n)", arg=initial["renewed"], timeout=40_000)
    assert page.evaluate("node => node === document.querySelector('iframe')", original_node)
    assert page.locator("iframe").get_attribute("src") == original_url
    page.get_by_role("button", name="Cerrar vista", exact=True).click()
    page.wait_for_function("n => fetch('/__lab/state').then(r => r.json()).then(s => s.deleted > n)", arg=initial["deleted"])
    assert page.locator("iframe").count() == 0
    check = context.new_page()
    assert check.goto(original_url).status == 410
    check.close()
    for modifier in ["Control", "Meta"]:
        page.get_by_role("link", name="Servidor", exact=True).click(modifiers=[modifier])
        page.frame_locator("iframe").locator('#ws[data-state="ok"]').wait_for()
        assert page.locator('[role="dialog"]').count() == 0
        page.get_by_role("button", name="Cerrar vista", exact=True).click()
    page.wait_for_function("n => fetch('/__lab/state').then(r => r.json()).then(s => s.deleted >= n)", arg=initial["deleted"] + 3)
    counts = page.evaluate("fetch('/__lab/state').then(r => r.json())")
    assert counts["created"] - initial["created"] == 3
    assert not any("__Host-danil_" in cookie for cookie in counts["previewCookies"])
    assert not errors, errors
    result = {"html": True, "css": True, "absolute_js": True, "fetch": True, "websocket": True,
              "local_clicks": 3, "popover": False, "renew_preserves_iframe": True, "close_status": 410,
              "danil_cookie_in_view": False, "page_errors": errors, "backend": "contract mock with binary tunnel"}
    (output / "browser.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    browser.close()
