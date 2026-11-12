"""Chromium with the real platform/Workers/PostgreSQL fixture behind its bridge."""
import json
import os
import urllib.request
from playwright.sync_api import sync_playwright, expect


keys = {}

def dispatch(route):
    request = route.request
    assert 'authorization' not in request.headers
    assert 'x-danil-workspace' not in request.headers
    init = dict(method=request.method, credentials='include', headers=request.headers)
    if request.post_data is not None:
        init['body'] = request.post_data
    call = urllib.request.Request(os.environ['DANIL_MESSAGING_BRIDGE'], data=json.dumps(dict(url=request.url, init=init)).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(call, timeout=10) as reply:
        result = json.load(reply)
    if request.method == 'POST' and request.url.endswith('/messaging/contacts'):
        assert result['status'] in (200, 201), result
        name = request.post_data_json['name']
        key = request.headers['idempotency-key']
        assert request.headers['x-csrf-token']
        if name not in keys:
            keys[name] = key
            return route.abort('failed')
        assert keys[name] == key
    headers = {k: v for k, v in result['headers'].items() if k.lower() not in ('content-encoding', 'content-length', 'transfer-encoding')}
    headers['access-control-allow-origin'] = request.headers.get('origin', '*')
    headers['access-control-allow-credentials'] = 'true'
    route.fulfill(status=result['status'], headers=headers, body=result['body'])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (1280, 390):
        page = browser.new_page(locale='es-MX', viewport=dict(width=width, height=720))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://api.danil.ai/**', dispatch)
        page.goto(os.environ['DANIL_INBOX_BROWSER_URL'])
        page.wait_for_load_state('networkidle')
        nav = page.get_by_role('navigation', name='Mensajería', exact=True)
        nav.get_by_role('button', name='Contactos', exact=True).click()
        panel = page.locator('[data-platform-messaging]')
        panel.locator('form').last.get_by_label('Nombre', exact=True).fill('Browser contact ' + str(width))
        panel.get_by_label('Teléfono', exact=True).fill('+521555123' + str(width).zfill(4))
        panel.get_by_role('button', name='Guardar contacto', exact=True).click()
        expect(panel.get_by_role('button', name='Reintentar operación', exact=True)).to_be_visible()
        panel.get_by_role('button', name='Reintentar operación', exact=True).click()
        expect(panel.get_by_role('button', name='Reintentar operación', exact=True)).to_have_count(0)
        # Contacts are ordered by last activity; a new contact has no conversation yet.
        while panel.get_by_text('Browser contact ' + str(width), exact=True).count() == 0:
            more = panel.get_by_role('button', name='Cargar más', exact=True)
            expect(more).to_be_enabled()
            more.click()
            expect(panel).to_have_attribute('aria-busy', 'false')
        expect(panel.get_by_text('Browser contact ' + str(width), exact=True)).to_be_visible()
        nav.get_by_role('button', name='Canales', exact=True).click()
        expect(panel.get_by_text('W5 web', exact=True)).to_be_visible()
        nav.get_by_role('button', name='Plantillas', exact=True).click()
        expect(panel.get_by_text('Hola de nuevo', exact=True)).to_be_visible()
        nav.get_by_role('button', name='Campañas', exact=True).click()
        expect(panel.get_by_text('W5 campaign', exact=True)).to_be_visible()
        nav.get_by_role('button', name='Medios', exact=True).click()
        expect(panel.locator('[data-messaging-unavailable]')).to_be_visible()
        assert not errors, errors
        page.close()
    browser.close()
    print('PASS: desktop/mobile real messaging domains; cookie only, contact persisted, explicit media unavailable')
