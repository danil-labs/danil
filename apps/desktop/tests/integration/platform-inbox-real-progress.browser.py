"""Chromium against the real Miniflare/HTTP workers/PostgreSQL integration fixture."""
import json
import os
import re
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

keys, statuses, times, trace = [], [], [], []
mode = os.environ.get('DANIL_INBOX_REVIEW_MODE', 'progress')


def dispatch(route):
    request = route.request
    assert 'authorization' not in request.headers
    payload = dict(url=request.url, init=dict(method=request.method, credentials='include', headers=request.headers))
    if request.method == 'POST':
        payload['init']['body'] = request.post_data
    is_reply = request.method == 'POST' and '/messaging/' in request.url
    if is_reply:
        keys.append(request.headers['idempotency-key'])
        times.append(time.monotonic())
    call = urllib.request.Request(os.environ['DANIL_INBOX_BRIDGE'], data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(call, timeout=10) as reply:
        result = json.load(reply)
    trace.append((request.url, result['status'], result['body'][:120]))
    if is_reply:
        statuses.append(result['status'])
    headers = {key: value for key, value in result['headers'].items() if key.lower() not in ('content-encoding', 'content-length', 'transfer-encoding')}
    # The fixture maps the local dev origin to the allowed alfa origin at the edge.
    headers['access-control-allow-origin'] = request.headers.get('origin', '*')
    headers['access-control-allow-credentials'] = 'true'
    route.fulfill(status=result['status'], headers=headers, body=result['body'])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    viewport = {'width': 390, 'height': 667} if mode == 'mobile' else {'width': 1280, 'height': 720}
    page = browser.new_page(locale='es-MX', viewport=viewport)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.danil.ai/**', dispatch)
    page.goto(os.environ['DANIL_INBOX_BROWSER_URL'])
    page.wait_for_load_state('networkidle')
    assert page.locator('[data-platform-inbox]').count(), (page.locator('body').inner_text(), errors, trace)
    inbox = page.locator('[data-platform-inbox]')
    inbox.get_by_role('button').filter(has_text=re.compile('Contact 9007199254740993/')).first.click()
    expect(inbox.locator('textarea')).to_be_enabled()
    if mode == 'mobile':
        textarea = inbox.locator('textarea')
        page.mouse.move(195, 500)
        deadline = time.monotonic() + 5
        while not textarea.evaluate('(element) => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }'):
            assert time.monotonic() < deadline, f'Composer unreachable by wheel at 390x667: {textarea.bounding_box()}'
            page.mouse.wheel(0, 800)
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        expect(textarea).to_be_in_viewport(ratio=1)
        textarea.click()
    inbox.locator('textarea').fill('browser in progress')
    inbox.locator('button[type=submit]').click()
    original_inbox = inbox.element_handle()
    if mode in ('active', 'switch'):
        expect(inbox.locator('form > button')).to_be_enabled(timeout=15000)
        buttons = page.locator('button[aria-pressed]')
        index = page.locator('button[aria-pressed=true]').evaluate('(element) => [...document.querySelectorAll("button[aria-pressed]")].indexOf(element)')
        buttons.nth(index if mode == 'active' else 1 - index).click()
        if mode == 'switch':
            expect(buttons.nth(1 - index)).to_have_attribute('aria-pressed', 'true')
            buttons.nth(index).click()
        expect(buttons.nth(index)).to_have_attribute('aria-pressed', 'true')
        expect(inbox).to_be_visible()
        if not inbox.locator('textarea').count():
            inbox.get_by_role('button').filter(has_text=re.compile('Contact 9007199254740993/')).first.click()
        review = inbox.locator('form > button')
        if review.count():
            review.click()
        expect(inbox.locator('textarea')).to_be_enabled()
        inbox.locator('textarea').fill('browser in progress')
        inbox.locator('button[type=submit]').click()
    expect(inbox.locator('textarea')).to_have_value('', timeout=15000)
    expected = [409, 409, 202] if mode in ('progress', 'mobile') else [409, 409, 409, 202]
    assert statuses == expected, (statuses, trace)
    assert len(set(keys)) == 1 and len(keys) == len(expected), keys
    if mode == 'active':
        assert original_inbox.evaluate('(element) => element.isConnected'), 'active workspace remounted inbox'
        assert not any('/workspaces/select' in url for url, _, _ in trace), trace
    elif mode == 'switch':
        assert sum('/workspaces/select' in url for url, _, _ in trace) == 2, trace
    assert all(b - a >= .95 for a, b in zip(times, times[1:])), times
    assert not errors, errors
    print(f'PASS Chromium {mode} {viewport}: actual workers {statuses}, same UUID, Retry-After respected, accepted receipt')
    browser.close()
