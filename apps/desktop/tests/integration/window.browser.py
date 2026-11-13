"""Built real window, Chromium, simulated cookie edge and ticket relay."""
import json
import os
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[4]
fixture = subprocess.check_output(['node', '--input-type=module', '-e', "import { engine } from './apps/desktop/tests/helpers/fake-relay.mjs'; console.log(JSON.stringify(Object.fromEntries(Object.entries(engine).map(([k,v])=>[k,typeof v === 'function' ? v({project:'p1',id:'t1'}) : v]))));"], cwd=root, text=True)
engine = json.loads(fixture)
base = os.environ.get('DANIL_WINDOW_BROWSER_URL', 'http://127.0.0.1:5189/terminus/')
state = dict(workspace='11', signed_in=True, unavailable=False, lose=False, writes=[], tickets=0)
requests = []
frames = []
machine = 'cmp_abcdefghijklmnopqrstuvwxyz'

def route_api(route):
    r = route.request
    requests.append(r)
    assert 'authorization' not in r.headers
    path = r.url.split('/v1/')[1]
    status = 200
    if path == 'identity/me':
        if not state['signed_in']:
            return route.fulfill(status=401, body='')
        if state['unavailable']:
            return route.fulfill(status=503, body='')
        data = dict(id='user_A', name='Operator', workspace=state['workspace'], organizations=[dict(id='org_A', name='Org')])
    elif path == 'workspaces':
        data = dict(items=[dict(id=i, org='org_A', name=n, role='owner') for i, n in [('11','Alpha'), ('12','Beta')]], next_cursor=None)
    elif path == 'identity/csrf':
        data = dict(csrf_token='bound')
    elif path == 'workspaces/select':
        assert r.headers['x-csrf-token'] == 'bound'
        state['writes'].append(r.headers['idempotency-key'])
        state['workspace'] = r.post_data_json['workspace']
        if state['lose']:
            state['lose'] = False
            state['unavailable'] = True
            return route.abort('failed')
        data = dict(workspace=state['workspace'], ctx='ctx', authz_ver=1)
    elif path == 'identity/logout':
        assert r.headers['x-csrf-token'] == 'bound'
        assert r.headers['idempotency-key']
        state['signed_in'] = False
        return route.fulfill(status=204)
    elif path == 'compute/computers':
        data = dict(computers=[dict(computer_id=machine, name='Laptop', state='online')], next_cursor=None)
    elif path == 'compute/workspaces':
        # B has not published the engine registry: discovery comes from the relay.
        return route.fulfill(status=404, content_type='application/problem+json', body=json.dumps(dict(code='route_not_found')))
    elif path == f'compute/computers/{machine}/tickets':
        assert r.headers['x-csrf-token'] == 'bound'
        assert r.headers['idempotency-key']
        state['tickets'] += 1
        data = dict(ticket=f'one-use-{state["tickets"]}', url=f'https://connect.danil.ai/v1/compute/computers/{machine}/session')
    else:
        raise AssertionError(path)
    route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

def relay(ws):
    def receive(raw):
        m = json.loads(raw)
        frames.append(m)
        if m['type'] == 'ping':
            return ws.send(json.dumps(dict(type='pong')))
        if m['type'] != 'call':
            return
        command = m['command']
        if command == 'send_message':
            value = 't_created'
        elif command in engine:
            value = engine[command]
        elif command == 'set_active_workspace':
            value = None
        else:
            return ws.send(json.dumps(dict(type='result', id=m['id'], error=dict(code='command'))))
        ws.send(json.dumps(dict(type='result', id=m['id'], value=value)))
    ws.on_message(receive)
    ws.send(json.dumps(dict(type='state', state='online')))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://edge.danil.ai/v1/**', route_api)
    page.route_web_socket('wss://connect.danil.ai/**', relay)
    page.goto(base)
    page.wait_for_load_state('networkidle')
    expect(page.locator('[data-tira]').first).to_be_visible()
    expect(page.locator('[data-danil-foot]')).to_be_visible()
    expect(page.get_by_text('Tarea t1', exact=True).first).to_be_visible()
    page.locator('textarea').first.fill('Beta task probe')
    page.locator('textarea').first.press('Enter')
    deadline = time.monotonic() + 5
    while not any(f.get('command') == 'send_message' for f in frames):
        assert time.monotonic() < deadline, 'Task command was not delivered to the relay'
        page.wait_for_timeout(20)
    sent = next(f for f in frames if f.get('command') == 'send_message')
    assert sent['args']['prompt'] == 'Beta task probe'
    assert sent['workspace'] == 'w'
    assert state['tickets'] > 0
    assert not any('messaging' in r.url or '/rest/v1' in r.url or 'alpha-api' in r.url for r in requests)
    page.get_by_role('button', name='Configuración', exact=True).click()
    expect(page.locator('#cfg-tab-account')).to_be_visible()
    page.locator('#cfg-tab-account').click()
    expect(page.locator('[data-account-name]')).to_have_text('Operator')
    expect(page.locator('[data-account-photo-input]')).to_have_count(0)
    page.keyboard.press('Escape')
    expect(page.locator('[role="dialog"]')).to_have_count(0)
    page.locator('[data-profile-menu] button').click()
    expect(page.get_by_role('button', name='Alpha', exact=True)).to_be_visible()
    # Both rows belong to the same organization, as returned by the current API.
    state['lose'] = True
    page.get_by_role('button', name='Beta', exact=True).click()
    expect(page.get_by_role('alert')).to_be_visible()
    state['unavailable'] = False
    page.get_by_role('button', name='Reintentar', exact=True).click()
    expect(page.locator('[data-tira]').first).to_be_visible()
    assert state['workspace'] == '12'
    assert state['writes'][0] == state['writes'][1]
    page.locator('[data-profile-menu] button').click()
    page.locator('[data-sign-out]').click()
    expect(page.get_by_role('link', name='Iniciar sesión', exact=True)).to_be_visible()
    expect(page.locator('[data-tira]')).to_have_count(0)
    assert not errors, errors
    print('PASS: real tasks, account, two API workspaces, uncertain selection recovery and logout; no messaging or bearer token')
    browser.close()
