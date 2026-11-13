"""Built real window, Chromium, identity and workspaces only; no machine service."""
import json
import os
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('DANIL_WINDOW_BROWSER_URL', 'http://127.0.0.1:5189/terminus/')
state = dict(workspace='11', signed_in=True, unavailable=False, lose=False, writes=[])
requests = []

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
    else:
        raise AssertionError(path)
    route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(locale='es-MX')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://edge.danil.ai/v1/**', route_api)
    page.add_init_script("""window.__sockets = []; window.WebSocket = class { constructor(url) { window.__sockets.push(url); throw new Error('No machine contract approved'); } };
      localStorage.setItem('danil.web.user_A.11.tasks', 'private'); localStorage.setItem('danil.web.user_A.12.tasks', 'private');""")
    page.goto(base)
    page.wait_for_load_state('networkidle')
    expect(page.locator('[data-tira]').first).to_be_visible()
    expect(page.locator('[data-danil-foot]')).to_be_visible()
    expect(page.locator('[data-machines-unavailable]')).to_be_visible()
    expect(page.locator('[data-attention-feature],[data-broadcasts],[data-inbox]')).to_have_count(0)
    expect(page.get_by_role('tab', name='Inbox', exact=True)).to_have_count(0)
    expect(page.get_by_role('tab', name='Difusiones', exact=True)).to_have_count(0)
    assert page.evaluate('window.__sockets') == []
    assert not any('/compute/' in r.url or 'messaging' in r.url or '/rest/v1' in r.url or 'alpha-api' in r.url for r in requests)
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
    assert page.evaluate("localStorage.getItem('danil.web.user_A.11.tasks')") is None
    assert page.evaluate("localStorage.getItem('danil.web.user_A.12.tasks')") is None
    assert page.evaluate('window.__sockets') == []
    assert not errors, errors
    print('PASS: real window, unavailable machines, account, two API workspaces, selection recovery and cache-clearing logout; no compute, relay or messaging')
    browser.close()
