"""Chromium over the built window with mvp-v1 edge and relay fixtures."""
import json
import os
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[4]
fixture = subprocess.check_output(['node', '--input-type=module', '-e', "import {engine} from './apps/desktop/tests/helpers/fake-relay.mjs'; console.log(JSON.stringify(Object.fromEntries(Object.entries(engine).map(([k,v])=>[k,typeof v === 'function' ? v({project:'p1',id:'t1'}) : v]))));"], cwd=root, text=True)
engine = json.loads(fixture)
base = os.environ.get('DANIL_WINDOW_BROWSER_URL', 'http://127.0.0.1:5189/terminus/')
state = dict(org='org_A', workspace='11', signed_in=True, routes=False, lose=False, unavailable=False, writes=[], org_writes=[], tickets=0, running=True, starts=0, polls=0)
requests, frames, sockets = [], [], []
orgs = [dict(id='org_A', name='Org Alpha', plan='enterprise', role='owner'), dict(id='org_B', name='Org Beta', plan='team', role='member')]
machine = 'cmp_fixture'

def row():
    return dict(machine_id=machine, name='Danil VM', state='running' if state['running'] else 'stopped', connection='connected' if state['running'] else 'disconnected', organization_id=state['org'])

def route_api(route):
    r = route.request
    requests.append(r)
    assert 'authorization' not in r.headers
    path = r.url.split('/v1/')[1]
    status, headers = 200, {}
    if path == 'capabilities':
        if not state['routes']:
            return route.fulfill(status=404)
        data = dict(contract='mvp-v1', items=[dict(name=n, version=1, status='available') for n in ['identity.web','identity.organizations','workspaces','machines','machines.start','machines.session']])
    elif path == 'identity/me':
        if not state['signed_in']:
            return route.fulfill(status=401)
        if state['unavailable']:
            return route.fulfill(status=503)
        data = dict(id='user_A', name='Operator', workspace=state['workspace'], organizations=orgs, active_organization_id=state['org'])
    elif path == 'identity/organizations':
        if not state['routes']:
            return route.fulfill(status=501)
        data = dict(items=orgs, next_cursor=None, active_organization_id=state['org'])
    elif path == 'identity/organizations/select':
        assert r.headers['x-csrf-token'] == 'bound'
        state['org_writes'].append(r.headers['idempotency-key'])
        state['org'] = r.post_data_json['organization_id']
        state['workspace'] = None
        data = dict(organization=next(o for o in orgs if o['id'] == state['org']), workspace=None)
    elif path == 'workspaces':
        choices = [('11','Alpha'),('12','Beta')] if state['org'] == 'org_A' else [('21','Gamma'),('22','Delta')]
        data = dict(items=[dict(id=i, org=state['org'], name=n, role='owner') for i,n in choices], next_cursor=None)
    elif path == 'identity/csrf':
        data = dict(csrf_token='bound')
    elif path == 'workspaces/select':
        assert r.headers['x-csrf-token'] == 'bound'
        state['writes'].append(r.headers['idempotency-key'])
        state['workspace'] = r.post_data_json['workspace']
        if state['lose']:
            state['lose'], state['unavailable'] = False, True
            return route.abort('failed')
        data = dict(workspace=dict(id=state['workspace'], org=state['org'], name='selected', role='owner'))
    elif path == 'identity/logout':
        assert r.headers['x-csrf-token'] == 'bound'
        state['signed_in'] = False
        return route.fulfill(status=204)
    elif path == 'machines':
        if not state['routes']:
            return route.fulfill(status=501)
        data = dict(items=[row()], next_cursor=None)
    elif path == f'machines/{machine}':
        data = row()
    elif path == f'machines/{machine}/start':
        assert r.headers['x-csrf-token'] == 'bound'
        assert r.headers['idempotency-key']
        state['starts'] += 1
        data = dict(operation=dict(operation_id='op_fixture', status='running', kind='machine.start', created_at='2026-11-13T00:00:00Z'))
        status, headers = 202, {'Location':'/v1/operations/op_fixture','Retry-After':'0','Access-Control-Expose-Headers':'Location, Retry-After'}
    elif path == 'operations/op_fixture':
        state['polls'] += 1
        state['running'] = True
        for socket in sockets:
            socket.send(json.dumps(dict(type='state', state='online')))
        data = dict(operation=dict(operation_id='op_fixture', status='succeeded', kind='machine.start', created_at='2026-11-13T00:00:00Z'))
    elif path == f'machines/{machine}/tickets':
        assert r.headers['x-csrf-token'] == 'bound'
        state['tickets'] += 1
        data = dict(ticket=f'one-use-{state["tickets"]}', url=f'wss://machines.danil.ai/v1/machines/{machine}/session', protocol='danil.machine-session.v1')
        status = 201
    else:
        raise AssertionError(path)
    route.fulfill(status=status, headers=headers, content_type='application/json', body=json.dumps(data))

def relay(ws):
    sockets.append(ws)
    def receive(raw):
        m = json.loads(raw)
        frames.append(m)
        if m['type'] == 'ping':
            return ws.send(json.dumps(dict(type='pong')))
        if m['type'] != 'call':
            return
        command = m['command']
        if command == 'send_message':
            assert state['running'], 'intent arrived before the start operation succeeded'
            value = 't_created'
        elif command in engine:
            value = engine[command]
        elif command == 'set_active_workspace':
            value = None
        else:
            return ws.send(json.dumps(dict(type='result', id=m['id'], error=dict(code='command'))))
        reply = dict(type='result', id=m['id'], value=value)
        if not state['running']:
            reply['cached'] = dict(updated_at=1731456000000)
        ws.send(json.dumps(reply))
    ws.on_message(receive)
    ws.send(json.dumps(dict(type='state', state='online')))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://edge.danil.ai/v1/**', route_api)
    page.route_web_socket('wss://machines.danil.ai/**', relay)
    # The mock relay negotiates the first offered protocol; negative negotiation is covered by the relay unit test.
    page.add_init_script("""const Socket=window.WebSocket; window.__protocols=[];
      window.WebSocket=class extends Socket { constructor(url,protocols) { super(url,protocols); window.__protocols.push(protocols); Object.defineProperty(this,'protocol',{value:protocols[0]}); } };
      localStorage.setItem('danil.web.user_A.11.tasks','private');""")
    page.goto(base)
    expect(page.locator('[data-tira]').first).to_be_visible()
    page.locator('[data-profile-menu] button').click()
    expect(page.get_by_text('Organización', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Org Alpha', exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('button', name='Org Beta', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    state['routes'] = True
    expect(page.get_by_text('Tarea t1', exact=True).first).to_be_visible(timeout=15000)
    assert state['tickets'] > 0
    assert all(protocols[0] == 'danil.machine-session.v1' and protocols[1].startswith('ticket.') for protocols in page.evaluate('window.__protocols'))
    expect(page.get_by_text('Conectar una cuenta', exact=True)).to_have_count(0)
    state['running'] = False
    for socket in sockets:
        socket.send(json.dumps(dict(type='state', state='offline')))
    expect(page.locator('[data-web-sync]')).to_have_attribute('data-state', 'offline')
    page.locator('textarea').first.fill('MVP machine probe')
    page.locator('textarea').first.press('Enter')
    deadline = time.monotonic() + 15
    while not any(frame.get('command') == 'send_message' for frame in frames):
        assert time.monotonic() < deadline, f'Task did not reach machine: starts={state["starts"]} polls={state["polls"]} commands={[f.get("command") for f in frames]} body={page.locator("body").inner_text()}'
        page.wait_for_timeout(30)
    assert state['starts'] == 1 and state['polls'] >= 1, f'starts={state["starts"]}, polls={state["polls"]}'
    page.get_by_role('button', name='Configuración', exact=True).click()
    expect(page.locator('[data-account-name]')).to_have_text('Operator')
    expect(page.get_by_role('button', name='Cambiar foto', exact=True)).to_be_disabled()
    page.keyboard.press('Escape')
    page.locator('[data-profile-menu] button').click()
    state['lose'] = True
    page.get_by_role('button', name='Beta', exact=True).click()
    expect(page.get_by_role('alert')).to_be_visible()
    state['unavailable'] = False
    page.get_by_role('button', name='Reintentar', exact=True).click()
    expect(page.locator('[data-tira]').first).to_be_visible()
    assert state['writes'][0] == state['writes'][1]
    page.locator('[data-profile-menu] button').click()
    page.get_by_role('button', name='Org Beta', exact=True).click()
    expect(page.locator('[data-tira]').first).to_be_visible()
    assert state['org'] == 'org_B' and state['workspace'] is None, 'only the server chooses the resulting workspace'
    page.locator('[data-profile-menu] button').click()
    expect(page.get_by_role('button', name='Org Beta', exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('button', name='Gamma', exact=True)).to_be_visible()
    page.locator('[data-sign-out]').click()
    expect(page.get_by_role('link', name='Iniciar sesión', exact=True)).to_be_visible()
    assert page.evaluate("localStorage.getItem('danil.web.user_A.11.tasks')") is None
    assert not any('/compute/' in req.url or '/messaging' in req.url for req in requests)
    assert not errors, errors
    print('PASS: organization fallback, late machines discovery, v1 ticket relay, start 202/Location, task, profile, workspace recovery, organization reload and cache-clearing logout')
    browser.close()
