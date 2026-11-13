"""Chromium with the real platform/Workers/PostgreSQL fixture behind its bridge."""
import json
import os
import urllib.request
from playwright.sync_api import sync_playwright, expect


keys = {}
requests = []

def dispatch(route):
    request = route.request
    assert 'authorization' not in request.headers
    assert 'x-danil-workspace' not in request.headers
    requests.append(dict(method=request.method, url=request.url, key=request.headers.get('idempotency-key'), body=request.post_data))
    init = dict(method=request.method, credentials='include', headers=request.headers)
    if request.post_data is not None:
        init['body'] = request.post_data
    call = urllib.request.Request(os.environ['DANIL_MESSAGING_BRIDGE'], data=json.dumps(dict(url=request.url, init=init)).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(call, timeout=10) as reply:
        result = json.load(reply)
    if request.method == 'POST' and any(request.url.endswith('/messaging/' + domain) for domain in ('contacts', 'campaigns', 'templates')):
        assert result['status'] in (200, 201, 403), result
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
        campaign_name = 'browser_campaign_' + str(width)
        form = panel.locator('form').last
        form.get_by_label('Nombre', exact=True).fill(campaign_name)
        form.get_by_role('combobox').nth(0).select_option(label='w5_saludo')
        form.get_by_role('combobox').nth(1).select_option(label='W5 WhatsApp')
        form.get_by_role('button', name='Crear campaña', exact=True).click()
        retry = panel.get_by_role('button', name='Reintentar operación', exact=True)
        expect(retry).to_be_visible()
        retry.click()  # The real edge denies this attempt before Workers deduplication.
        expect(panel.get_by_role('alert')).to_be_visible()
        expect(retry).to_be_enabled()
        nav.get_by_role('button', name='Canales', exact=True).click()
        nav.get_by_role('button', name='Campañas', exact=True).click()
        expect(retry).to_be_enabled()
        expect(panel.get_by_role('button', name='Crear campaña', exact=True)).to_be_disabled()
        retry.click()
        expect(retry).to_have_count(0)
        expect(panel.get_by_text(campaign_name, exact=True)).to_be_visible()
        attempts = [r for r in requests if r['body'] and campaign_name in r['body']]
        assert len(attempts) == 3 and len({r['key'] for r in attempts}) == 1, attempts

        nav.get_by_role('button', name='Plantillas', exact=True).click()
        template_name = 'browser_template_' + str(width)
        form = panel.locator('form').last
        form.get_by_label('Nombre', exact=True).fill(template_name)
        form.get_by_role('combobox').nth(0).select_option(label='W5 WhatsApp')
        form.get_by_label('Mensaje', exact=True).fill('Hola')
        form.get_by_role('button', name='Guardar borrador', exact=True).click()
        expect(retry).to_be_visible()
        nav.get_by_role('button', name='Canales', exact=True).click()
        nav.get_by_role('button', name='Plantillas', exact=True).click()
        expect(retry).to_be_enabled()
        retry.click()
        expect(retry).to_have_count(0)
        editor = panel.locator('li').filter(has=page.get_by_text(template_name, exact=True)).locator('form')
        editor.get_by_role('combobox').nth(0).select_option(label='W5 WhatsApp')
        assert editor.evaluate('(form) => form.checkValidity()')
        with page.expect_response(lambda response: response.request.method == 'PATCH' and '/messaging/templates/' in response.url) as edited:
            editor.get_by_role('button', name='Guardar borrador', exact=True).click()
        assert edited.value.status == 200
        expect(panel).to_have_attribute('aria-busy', 'false')
        expect(panel.get_by_role('alert')).to_have_count(0)
        attempts = [r for r in requests if r['body'] and template_name in r['body']]
        assert [r['method'] for r in attempts] == ['POST', 'POST', 'PATCH'], attempts
        assert attempts[0]['key'] == attempts[1]['key'] != attempts[2]['key'], attempts
        assert attempts[0]['body'] == attempts[2]['body'], attempts
        nav.get_by_role('button', name='Medios', exact=True).click()
        expect(panel.locator('[data-messaging-unavailable]')).to_be_visible()
        assert not errors, errors
        page.close()
    browser.close()
    print('PASS: desktop/mobile real messaging domains; cookie only, lost campaign/403/remount/recovery, template POST/PATCH identity, one effect per operation')
