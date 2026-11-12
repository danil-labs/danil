"""Chromium against the real Miniflare/HTTP workers/PostgreSQL integration fixture."""
import json
import os
import re
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

keys, statuses, times, trace = [], [], [], []


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
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.danil.ai/**', dispatch)
    page.goto(os.environ['DANIL_INBOX_BROWSER_URL'])
    page.wait_for_load_state('networkidle')
    assert page.locator('[data-platform-inbox]').count(), (page.locator('body').inner_text(), errors, trace)
    inbox = page.locator('[data-platform-inbox]')
    inbox.get_by_role('button').filter(has_text=re.compile('Contact 9007199254740993/')).first.click()
    expect(inbox.locator('textarea')).to_be_enabled()
    inbox.locator('textarea').fill('browser in progress')
    inbox.locator('button[type=submit]').click()
    expect(inbox.locator('textarea')).to_have_value('', timeout=15000)
    assert statuses == [409, 409, 202], statuses
    assert len(set(keys)) == 1 and len(keys) == 3, keys
    assert all(b - a >= .95 for a, b in zip(times, times[1:])), times
    assert not errors, errors
    print('PASS Chromium: actual workers 409/409/202, same UUID, Retry-After respected, accepted receipt')
    browser.close()
