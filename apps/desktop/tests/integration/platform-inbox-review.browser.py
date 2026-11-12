"""Chromium regressions for #820; run once per inbox deployment mode."""
import base64
import json
import os
import time
from playwright.sync_api import sync_playwright, expect

mode = os.environ.get('DANIL_INBOX_REVIEW_MODE', 'progress')
base = os.environ.get('DANIL_INBOX_BROWSER_URL', 'http://127.0.0.1:5187/terminus/web.html')
created = '2026-11-12T00:00:00Z'
requests, keys, times = [], [], []
rows = {}
legacy_token = 'x.' + base64.b64encode(json.dumps(dict(active_account_id=11, role='authenticated')).encode()).decode() + '.y'


def route_api(route):
    r = route.request
    requests.append(r)
    path = r.url.split('/v1/')[-1]
    if 'api.danil.ai' in r.url:
        assert 'authorization' not in r.headers
        if path == 'identity/me':
            data = dict(id='user_A', name='Operator', workspace='11', organizations=[])
        elif path == 'workspaces':
            data = dict(items=[dict(id='11', org='org_A', name='Alpha', role='owner')], next_cursor=None)
        elif path == 'identity/csrf':
            data = dict(csrf_token='bound')
        elif path.startswith('messaging/conversations'):
            if r.method == 'POST':
                key = r.headers['idempotency-key']
                keys.append(key)
                times.append(time.monotonic())
                rows.setdefault(key, dict(id='ms_' + str(len(rows) + 1)))
                if len(keys) < 3 and key == keys[0]:
                    return route.fulfill(status=409, content_type='application/problem+json', headers={'Retry-After': '1', 'Access-Control-Expose-Headers': 'Retry-After'}, body=json.dumps(dict(type='https://docs.danil.ai/errors/idempotency_in_progress', title='In progress', status=409, code='idempotency_in_progress')))
                return route.fulfill(status=202, content_type='application/json', body=json.dumps(dict(**rows[key], object='message_send', status='queued', contact_id='ct_A', channel_id='ch_A', created_at=created)))
            message = dict(id='msg_A', object='message', conversation_id='cnv_A', direction='inbound', author=dict(type='contact'), kind='text', text='latest', created_at=created)
            conversation = dict(id='cnv_A', object='conversation', contact=dict(id='ct_A', name='Ana', phone=None), channel_id='ch_A', status='open', ai_enabled=False, unread_count=0, created_at=created)
            data = dict(data=[message if '/messages' in path else conversation], page=dict(has_more=False, next_cursor=None))
        else:
            raise AssertionError(r.url)
    elif '/auth/session' in r.url:
        data = dict(access_token=legacy_token, expires_at=int(time.time()) + 300, user=dict(user_id='legacy-user', email='operator@test.invalid', name='Operator'))
    elif 'machines.danil.ai' in r.url:
        assert r.headers['authorization'] == 'Bearer ' + legacy_token
        data = dict(workspaces=[dict(key='a:11', workspace_id=None, danil_workspace_id=11, name='Alpha', capabilities=dict(agents=True, terminus=False))], truncated=False)
    elif '/alpha-api/' in r.url:
        assert r.headers['authorization'] == 'Bearer ' + legacy_token
        if '/my-permissions' in r.url:
            data = dict(role='owner', permissions=['inbox.respond'], scoped=[])
        elif '/messages?' in r.url:
            data = dict(messages=[dict(id=9, conversation_id=12, content='legacy history', direction='inbound', sender_type='contact')], hasMore=False)
        elif r.url.endswith('/api/messaging/reply'):
            key = r.post_data_json['client_message_id']
            keys.append(key)
            rows.setdefault(key, dict(id=1))
            return route.fulfill(status=201, content_type='application/json', body=json.dumps(dict(status='pending', outgoing_id=1)))
        else:
            assert '/api/inbox/conversations?' in r.url
            data = dict(conversations=[dict(id=12, account_id=11, contact_name='Legacy Ana', channel_name='Web', last_message='legacy history', ai_assistance=False, unread_count=0)], hasMore=False)
    else:
        raise AssertionError(r.url)
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.danil.ai/**', route_api)
    page.route('https://machines.danil.ai/**', route_api)
    page.route('**/auth/session', route_api)
    page.route('**/alpha-api/**', route_api)
    if mode == 'legacy' and os.environ.get('DANIL_INBOX_PREVIOUS_URL'):
        page.goto(os.environ['DANIL_INBOX_PREVIOUS_URL'])
        page.wait_for_load_state('networkidle')
        expect(page.locator('[data-platform-inbox]')).to_be_visible()
    rollback_start = len(requests)
    page.goto(base)
    page.wait_for_load_state('networkidle')
    expect(page.locator('[data-platform-session]')).to_be_visible()
    expect(page.get_by_text('Operator', exact=True)).to_be_visible()
    inbox = page.locator('[data-platform-inbox]' if mode == 'progress' else '[data-alpha-inbox]')
    expect(inbox).to_be_visible()
    inbox.get_by_text('Ana' if mode == 'progress' else 'Legacy Ana', exact=True).click()
    expect(inbox.get_by_text('latest' if mode == 'progress' else 'legacy history', exact=True).last).to_be_visible()
    inbox.locator('textarea').fill('hola')
    send = inbox.locator('button[type=submit]')
    send.click()
    if mode == 'progress':
        deadline = time.monotonic() + 10
        while len(keys) < 2 and time.monotonic() < deadline:
            if keys and send.is_enabled():  # The old manual retry lost the operation key.
                send.click()
            page.wait_for_timeout(25)
        assert len(keys) >= 2 and keys[0] == keys[1], keys
        expect(inbox.locator('textarea')).to_have_value('', timeout=10000)
        assert len(keys) == 3 and len(set(keys)) == 1, keys
        assert all(b - a >= .95 for a, b in zip(times, times[1:])), times
        assert len(rows) == 1, rows
        print('PASS: two 409 in-progress responses, same UUID, Retry-After/backoff, one queued row')
    else:
        expect(inbox.locator('textarea')).to_have_value('')
        assert len(keys) == 1 and len(rows) == 1
        assert not any('/v1/messaging/' in r.url for r in requests[rollback_start:])
        assert not any('/logout' in r.url for r in requests)
        assert any('/v1/identity/me' in r.url for r in requests)
        expect(page.get_by_text('Operator', exact=True)).to_be_visible()
        print('PASS: platform session stays active while legacy inbox lists, reads and replies through alpha-api')
    assert not errors, errors
    browser.close()
