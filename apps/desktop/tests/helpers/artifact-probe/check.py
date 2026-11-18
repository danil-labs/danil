"""Run against a Vite server or built fixture with Python Playwright."""
import argparse
import json
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://localhost:5174")
args = parser.parse_args()
url = args.url.rstrip("/") + "/tests/helpers/artifact-probe/index.html"
results = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
    try:
        page = browser.new_page()
        for outcome in ["resolve", "reject"]:
            page.goto(url)
            page.locator("[data-probe-ready]").wait_for(state="attached")
            page.evaluate("probe.setPath('/b.txt')")
            page.evaluate("probe.resolve(1, 'Current B')")
            expect(page.get_by_text("Current B", exact=True)).to_be_visible()
            page.evaluate("probe." + outcome + "(0, 'STALE A')")
            expect(page.get_by_text("Current B", exact=True)).to_be_visible()
            expect(page.get_by_text("STALE A", exact=True)).to_have_count(0)
            expect(page.get_by_text("Stale failure", exact=True)).to_have_count(0)
            results.append("obsolete " + outcome + " ignored")
        page.goto(url)
        page.locator("[data-probe-ready]").wait_for(state="attached")
        page.evaluate("probe.resolve(0, 'Old scope')")
        expect(page.get_by_text("Old scope", exact=True)).to_be_visible()
        page.evaluate("probe.setSession('two')")
        expect(page.get_by_text("Old scope", exact=True)).to_have_count(0)
        assert page.evaluate("probe.reads()") == 2
        page.evaluate("probe.resolve(1, 'New scope')")
        expect(page.get_by_text("New scope", exact=True)).to_be_visible()
        results.append("same path in different task reloads without stale display")
        page.goto(url)
        page.locator("[data-probe-ready]").wait_for(state="attached")
        page.evaluate("probe.resolve(0, 'Stable document')")
        expect(page.get_by_text("Stable document", exact=True)).to_be_visible()
        page.evaluate("probe.refreshMachine()")
        assert page.evaluate("probe.reads()") == 1, "unchanged machine triggered another preview read"
        expect(page.get_by_text("Stable document", exact=True)).to_be_visible()
        results.append("same-machine lookup refresh keeps preview and single read")
        page.evaluate("probe.refreshMachine('machine-two')")
        assert page.evaluate("probe.reads()") == 2
        expect(page.get_by_text("Stable document", exact=True)).to_have_count(0)
        page.evaluate("probe.resolve(1, 'Moved document')")
        expect(page.get_by_text("Moved document", exact=True)).to_be_visible()
        results.append("changed machine invalidates and reloads preview")
        print(json.dumps({"passed": results, "transport": "controlled preview_file; real component and Chromium"}))
    finally:
        browser.close()
