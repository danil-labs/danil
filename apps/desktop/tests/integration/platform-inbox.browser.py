"""Run against a platform build/preview with Playwright 1.58 installed."""
import json
import os
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('DANIL_INBOX_BROWSER_URL', 'http://127.0.0.1:5187/terminus/web.html')
created = '2026-11-12T00:00:00Z'
conversation = dict(id='cnv_opaque', object='conversation', contact=dict(id='ct_A', name='Ana', phone='+521555123456'), channel_id='ch_A', status='open', ai_enabled=False, unread_count=1, created_at=created)
requests = []
keys = []
state = dict(workspace='11', lose=True, denied=False, writes=0)

def route_api(route):
    request = route.request
    requests.append(request)
    assert 'authorization' not in request.headers
    assert 'x-danil-workspace' not in request.headers
    path = request.url.split('/v1/')[1]
    status = 200
    if path == 'identity/me':
        data = dict(id='user_A', name='Operator', workspace=state['workspace'], organizations=[])
    elif path == 'workspaces':
        data = dict(items=[dict(id=id, org='org_A', name=name, role='owner') for id, name in [('11', 'Alpha'), ('22', 'Beta')]], next_cursor=None)
    elif path == 'identity/csrf':
        data = dict(csrf_token='bound')
    elif path == 'workspaces/select':
        state['workspace'] = request.post_data_json['workspace']
        data = dict(workspace=state['workspace'], ctx='ctx', authz_ver=1)
    elif path.startswith('messaging/conversations'):
        if request.method == 'POST':
            assert request.headers['x-csrf-token'] == 'bound'
            keys.append(request.headers['idempotency-key'])
            assert request.post_data_json == dict(text='hola')
            if state['denied']:
                data = dict(type='https://docs.danil.ai/errors/insufficient_scope', title='Denied', status=403, code='insufficient_scope')
                return route.fulfill(status=403, content_type='application/problem+json', body=json.dumps(data))
            if state['lose']:
                state['lose'] = False
                state['writes'] += 1
                return route.abort('failed')  # server committed, browser lost the response
            status = 202
            data = dict(id='ms_once', object='message_send', status='queued', contact_id='ct_A', channel_id='ch_A', created_at=created)
        else:
            older = 'cursor=' in path
            rows = [dict(id='msg_old' if older else 'msg_new', object='message', conversation_id='cnv_opaque', direction='inbound', author=dict(type='contact'), kind='text', text='older' if older else 'latest', created_at=created)] if '/messages' in path else [{**conversation, 'contact': {**conversation['contact'], 'name': 'Ana' if state['workspace'] == '11' else 'Bea'}}]
            data = dict(data=rows, page=dict(has_more=not older, next_cursor=None if older else 'opaque+/='))
    else:
        raise AssertionError(path)
    route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.danil.ai/v1/**', route_api)
    page.goto(base)
    page.wait_for_load_state('networkidle')
    inbox = page.locator('[data-platform-inbox]')
    expect(inbox).to_be_visible()
    inbox.get_by_text('Ana', exact=True).click()
    expect(inbox.get_by_text('latest', exact=True)).to_be_visible()
    inbox.get_by_role('button', name='Ver mensajes anteriores', exact=True).click()
    expect(inbox.get_by_text('older', exact=True)).to_be_visible()
    textarea = inbox.locator('textarea')
    textarea.fill('hola')
    inbox.locator('button[type=submit]').click()
    expect(inbox.locator('button[type=submit]')).to_be_disabled()
    # Reconciliation rereads messages. The next explicit attempt keeps the operation key.
    inbox.get_by_role('button', name='Releer el hilo', exact=True).click()
    expect(inbox.locator('button[type=submit]')).to_be_enabled()
    inbox.locator('button[type=submit]').click()
    expect(textarea).to_have_value('')
    assert len(keys) == 2 and keys[0] == keys[1]
    assert state['writes'] == 1
    state['denied'] = True
    textarea.fill('hola')
    inbox.locator('button[type=submit]').click()
    expect(inbox.get_by_role('alert')).to_be_visible()
    expect(textarea).to_have_value('hola')
    page.get_by_role('button', name='Beta', exact=True).click()
    expect(inbox.get_by_text('Bea', exact=True)).to_be_visible()
    expect(inbox.get_by_text('Ana', exact=True)).to_have_count(0)
    assert not errors, errors
    assert all('/alpha-api' not in request.url for request in requests)
    assert any('cursor=opaque%2B%2F%3D' in request.url for request in requests)
    print('PASS: opaque IDs, cursor, history, lost response/retry same key, 403, workspace isolation, zero JS errors')
    browser.close()
