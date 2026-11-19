"""H-PV2: Configuración → Proveedores de IA en Chromium, con borde y relay simulados.

Sirve la web construida (`pnpm web:build`, carpeta `dist-web/`) con un servidor
estático propio, responde el borde (`route_api`) y el relay (`route_web_socket`)
con el patrón de `window.browser.py`, y mide la pantalla real.

Escenarios (docs/testing/2026-11-19-proveedores-ia.md § anchos W1–W7):
  none, one, four, reconnect, list-fails.

Las columnas de la cuadrícula las trae T2: contra `dev` esas aserciones van
PENDIENTES (se miden, se imprimen y no fallan). `DANIL_PV2_STRICT=1` las vuelve
obligatorias; T2 lo activa en su commit.

  DANIL_WEB_API_ORIGIN=https://edge.danil.ai pnpm web:build
  uv run --with playwright python tests/integration/ai-providers.browser.py

`DANIL_PV2_URL` apunta a otra instancia ya servida en vez de levantar la propia.
Se necesita `playwright install chromium` una vez.
"""
import functools
import http.server
import json
import os
import subprocess
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[4]
desktop = root / 'apps' / 'desktop'
strict = os.environ.get('DANIL_PV2_STRICT') == '1'
MACHINE = 'cmp_abcdefghijklmnopqrstuvwxyz'
WIDTHS = [('W1', 960, 3), ('W2', 768, 3), ('W3', 767, 2), ('W4', 640, 2), ('W5', 512, 2), ('W6', 511, 1), ('W7', 320, 1)]

fixture = subprocess.check_output(['node', '--input-type=module', '-e', "import { engine } from './apps/desktop/tests/helpers/fake-relay.mjs'; console.log(JSON.stringify(Object.fromEntries(Object.entries(engine).map(([k,v])=>[k,typeof v === 'function' ? v({project:'p1',id:'t1'}) : v]))));"], cwd=root, text=True)
engine = json.loads(fixture)
# El workspace del motor tiene el id del workspace de la plataforma: así el router web lo reparte a esta máquina.
for key in ('list_workspaces', 'workspaces_startup'):
    engine[key] = dict(workspaces=[dict(id='11', name='W', context_root=None)], active='11')


def account(n, identity=True):
    return dict(id=f'acc{n}', label=f'Cuenta {n}', created_at=1_700_000_000 + n, identity=f'persona{n}@ejemplo.com' if identity else None, authenticated_at=1_700_000_100 + n)


def listing(accounts, active=None):
    return dict(provider='codex', env_var='', shared_credential=None, secret_note=None, active=active if active else (accounts[0]['id'] if accounts else None), accounts=accounts)


def read(used):
    return dict(mode='read', windows=[dict(label='Últimas 5 horas', used_pct=used, resets_at=None, duration_s=18000), dict(label='Esta semana', used_pct=used / 2, resets_at=None, duration_s=604800)], plan='Plus', fetched_at=int(time.time() * 1000))


SCENARIOS = {
    'none': dict(accounts=[]),
    'one': dict(accounts=[account(1)]),
    'four': dict(accounts=[account(n) for n in range(1, 5)]),
    'reconnect': dict(accounts=[account(1), account(2)], revoked={'acc2'}),
    'list-fails': dict(accounts=[], fail_list=True),
}


class Harness:
    def __init__(self, scenario):
        self.scenario = scenario
        self.calls = []
        self.frames = []
        self.requests = []
        self.sockets = []
        self.absent = set()
        self.cursor = 0

    def table(self, command, args):
        s = self.scenario
        if command == 'list_accounts':
            if s.get('fail_list'):
                return ('error', dict(code='command'))
            return ('ok', listing(s['accounts']))
        if command == 'account_status':
            ok = args.get('id') not in s.get('revoked', set())
            return ('ok', dict(id=args.get('id'), authenticated=ok, detail=f"persona{args.get('id', '')[3:]}@ejemplo.com" if ok else 'session expired'))
        if command == 'account_limits':
            if args.get('id') in s.get('revoked', set()):
                return ('ok', dict(mode='revoked', what='La sesión venció', detail='401'))
            return ('ok', read(30 + 10 * int(args.get('id', 'acc0')[3:] or 0)))
        if command in ('send_message',):
            return ('ok', 't_created')
        if command == 'add_account':
            return ('ok', dict(id='acc9'))
        if command in ('set_active_workspace', 'login_account', 'cancel_login', 'submit_login_code', 'remove_account', 'set_active_account'):
            return ('ok', None)
        if command == 'list_surfaces':
            return ('ok', [dict(id='codex', provider='codex', label='Codex', catalogo='todo', usable=True, marca=None, porque=None)])
        if command == 'list_providers':
            return ('ok', [dict(id='codex', label='Codex', available=True, driver=True, limits=True, sin_cuenta=False, api_key=None, inferencia='con_cuenta')])
        if command in engine:
            return ('ok', engine[command])
        return ('error', dict(code='command'))

    def api(self, route):
        r = route.request
        self.requests.append(r)
        assert 'authorization' not in r.headers
        path = r.url.split('/v1/')[1]
        if path == 'identity/me':
            data = dict(id='user_A', name='Operator', workspace='11', organizations=[dict(id='org_A', name='Org')])
        elif path == 'workspaces':
            data = dict(items=[dict(id='11', org='org_A', name='W', role='owner')], next_cursor=None)
        elif path == 'identity/csrf':
            data = dict(csrf_token='bound')
        elif path == 'capabilities':
            data = dict(contract='mvp-v1', items=[dict(name=n, version=1, status='available') for n in ('machines', 'machines.start', 'machines.session', 'workspaces')])
        elif path == 'machines':
            data = dict(items=[dict(machine_id=MACHINE, name='Danil', state='running', connection='connected', workspaces=['11'])], next_cursor=None)
        elif path == f'machines/{MACHINE}/tickets':
            data = dict(ticket='one-use', url='wss://connect.danil.ai/v1/machines/' + MACHINE + '/session', expires_at='2099-01-01T00:00:00Z')
        else:
            # Un borde que aún no publica estas rutas (capabilities, organizations, machines…):
            # la ventana las trata como ausentes. Se anotan para el reporte.
            self.absent.add(path)
            return route.fulfill(status=404, body='')
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data))

    def relay(self, ws):
        self.sockets.append(ws)

        def receive(raw):
            m = json.loads(raw)
            self.frames.append(m)
            if m['type'] == 'ping':
                return ws.send(json.dumps(dict(type='pong')))
            if m['type'] == 'subscribe':
                # Protocolo v1: la primera página tras `subscribe` cierra el reenvío; sin ella todo lo
                # que sigue se trata como repetición y no llega a los oyentes de la pantalla.
                self.cursor += 1
                return ws.send(json.dumps(dict(type='events', runtime='rt1', cursor=self.cursor, replay=False, events=[])))
            if m['type'] != 'call':
                return
            self.calls.append((m['command'], m.get('args') or {}))
            kind, value = self.table(m['command'], m.get('args') or {})
            if kind == 'error':
                return ws.send(json.dumps(dict(type='result', id=m['id'], error=value)))
            ws.send(json.dumps(dict(type='result', id=m['id'], value=value)))
        ws.on_message(receive)
        ws.send(json.dumps(dict(type='state', state='online')))

    def push_event(self, name, payload):
        """Un `events` del relay (protocolo v1): lo que el motor publica en su diario."""
        self.cursor += 1
        for ws in self.sockets:
            ws.send(json.dumps(dict(type='events', runtime='rt1', cursor=self.cursor, replay=False, events=[dict(name=name, payload=payload, seq=self.cursor)])))


missing = set()


def serve():
    """Servidor estático de dist-web con la página única como respaldo."""
    web = desktop / 'dist-web'
    assert (web / 'terminus' / 'index.html').exists(), 'falta dist-web: DANIL_WEB_API_ORIGIN=https://edge.danil.ai pnpm web:build'

    class Handler(http.server.SimpleHTTPRequestHandler):
        def translate_path(self, path):
            target = Path(super().translate_path(path))
            if not (target.exists() and target.is_file()):
                missing.add(path)
                return str(web / 'terminus' / 'index.html')
            return str(target)

        def log_message(self, *args):
            pass
    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 256  # la página pide cientos de trozos a la vez; con la cola por omisión (5) el navegador recibe resets
    server = Server(('127.0.0.1', 0), functools.partial(Handler, directory=str(web)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


results = []


def pending(label, check):
    """Mide y cuenta; contra `dev` no falla. Con DANIL_PV2_STRICT=1 es obligatoria."""
    try:
        check()
        results.append(('PASS', label))
    except Exception as error:  # noqa: BLE001
        if strict:
            raise
        results.append(('PENDING', f'{label}: {str(error).splitlines()[0][:140]}'))


def open_providers(page, base, h):
    page.goto(base)
    page.wait_for_load_state('networkidle')
    expect(page.locator('[data-tira]').first).to_be_visible()
    # El router web aprende qué máquina tiene el workspace con las primeras lecturas; una
    # `list_accounts` que llega antes cae en «Ninguna máquina de la cuenta tiene este workspace».
    until(page, lambda: any(c == 'list_session_git' for c, _ in h.calls), lambda: f'el relay no contestó las lecturas del workspace: {h.calls}')
    page.wait_for_timeout(500)
    page.get_by_role('button', name='Configuración', exact=True).click()
    # La entrada de la barra lateral se llama «Cuentas de IA»; su pestaña es «proveedores-ia».
    entry = page.locator('#cfg-tab-ai-accounts')
    expect(entry).to_be_visible()
    entry.click()
    sub = page.locator('#cfg-sub-proveedores-ia')
    if sub.count():
        sub.click()
    expect(page.locator('[data-ai-providers="loading"]')).to_have_count(0)


def until(page, read, why, seconds=8):
    deadline = time.monotonic() + seconds
    while not read():
        assert time.monotonic() < deadline, why()
        page.wait_for_timeout(25)


def columns(page, identity):
    return page.evaluate("""(identity) => {
        const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes(identity));
        const list = li.parentElement;
        const cards = [...list.children].filter(x => x.tagName === 'LI');
        const first = Math.min(...cards.map(c => c.getBoundingClientRect().top));
        const row = cards.filter(c => Math.abs(c.getBoundingClientRect().top - first) < 2);
        const box = list.closest('.\\\\@container') || list.parentElement;
        return { cols: new Set(row.map(c => Math.round(c.getBoundingClientRect().left))).size, cards: cards.length,
          overflow: box.scrollWidth > box.clientWidth + 1, minCard: Math.min(...cards.map(c => c.getBoundingClientRect().width)) };
    }""", identity)


def set_width(page, identity, width):
    page.evaluate("""([identity, width]) => {
        const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes(identity));
        const list = li.parentElement;
        const box = list.closest('.\\\\@container') || list.parentElement;
        box.style.width = width + 'px'; box.style.maxWidth = 'none'; box.style.boxSizing = 'border-box';
    }""", [identity, width])
    page.wait_for_timeout(60)


def expand(page, name):
    dialog = page.locator('[role="dialog"]')
    # Los grupos de proveedor llegan plegados si ninguna tarea abierta usa ese agente.
    group = dialog.get_by_role('heading', level=3).filter(has_text='Codex').get_by_role('button').first
    try:
        expect(group).to_be_visible()
    except AssertionError:
        raise AssertionError(f'{name}: sin grupo Codex: {dialog.inner_text()[-800:]!r}')
    if group.get_attribute('aria-expanded') == 'false':
        group.click()


def run(browser, base, name):
    h = Harness(SCENARIOS[name])
    page = browser.new_page(locale='es-MX', viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://edge.danil.ai/v1/**', h.api)
    page.route_web_socket('wss://connect.danil.ai/**', h.relay)
    open_providers(page, base, h)
    until(page, lambda: any(c == 'list_accounts' and a.get('provider') == 'codex' for c, a in h.calls), lambda: f'sin list_accounts de codex: {[c for c, _ in h.calls if "account" in c]}')
    assert any(c == 'list_surfaces' for c, _ in h.calls), h.calls
    dialog = page.locator('[role="dialog"]')
    expand(page, name)
    accounts = h.scenario['accounts']
    if name == 'none':
        expect(dialog.get_by_text('Conectar Codex', exact=True)).to_be_visible()
        expect(dialog.get_by_role('button', name='Agregar cuenta')).to_be_visible()
    elif name == 'list-fails':
        expect(dialog.get_by_text('persona1@ejemplo.com')).to_have_count(0)
        # Falla la lista de Codex (y la del Router): el mensaje queda en el grupo y no hay cuentas inventadas.
        expect(dialog.get_by_text('No se pudieron leer las cuentas.')).to_have_count(2)
    else:
        for a in accounts:
            expect(dialog.get_by_text(a['identity']).first).to_be_visible()
        # Cuotas: una ProgressBar por ventana de cada cuenta que no está revocada.
        live = [a for a in accounts if a['id'] not in h.scenario.get('revoked', set())]
        until(page, lambda: any(c == 'account_limits' for c, _ in h.calls), lambda: f'sin account_limits: {[c for c, _ in h.calls if "account" in c]}')
        expect(dialog.locator('[role="progressbar"]').first).to_be_visible()
        until(page, lambda: dialog.locator('[role="progressbar"]').count() >= 2 * len(live), lambda: f'{dialog.locator("[role=progressbar]").count()} barras para {len(live)} cuentas')
    if name == 'reconnect':
        expect(dialog.get_by_role('button', name='Reconectar').first).to_be_visible()
    if name == 'four':
        identity = 'persona1@ejemplo.com'
        for label, width, expected in WIDTHS:
            set_width(page, identity, width)
            got = columns(page, identity)
            assert got['cards'] >= 4, got
            pending(f'{label} {width}px → {expected} columnas (hoy {got["cols"]})', lambda: _eq(got['cols'], expected))
            pending(f'{label} {width}px sin desborde horizontal ni tarjetas < 240 px', lambda: _fits(got))
    assert not errors, (errors, sorted(missing))
    results.append(('PASS', f'{name}: pantalla cargada, grupos y cuotas'))
    return h, page


def _eq(got, expected):
    assert got == expected, f'{got} != {expected}'


def _fits(got):
    assert not got['overflow'] and got['minCard'] >= 240, got


with sync_playwright() as p:
    server = None
    base = os.environ.get('DANIL_PV2_URL')
    if not base:
        server = serve()
        base = f'http://127.0.0.1:{server.server_address[1]}/terminus/'
    browser = p.chromium.launch(headless=True)
    try:
        last = None
        for name in SCENARIOS:
            last = run(browser, base, name)
        # ¿El relay simulado entrega el evento `account`? Se prueba con el login real.
        h = Harness(SCENARIOS['one'])
        page = browser.new_page(locale='es-MX', viewport={'width': 1440, 'height': 900})
        page.route('https://edge.danil.ai/v1/**', h.api)
        page.route_web_socket('wss://connect.danil.ai/**', h.relay)
        open_providers(page, base, h)
        page.evaluate("""() => { window.__account = []; }""")
        until(page, lambda: any(c == 'list_accounts' and a.get('provider') == 'codex' for c, a in h.calls), lambda: 'sin list_accounts de codex')
        expand(page, 'event')
        page.locator('[role="dialog"]').get_by_role('button', name='Agregar cuenta').first.click(timeout=8000)
        deadline = time.monotonic() + 5
        while not any(c in ('add_account', 'login_account') for c, _ in h.calls):
            assert time.monotonic() < deadline, 'Agregar cuenta no llegó al relay'
            page.wait_for_timeout(20)
        until(page, lambda: any(c == 'login_account' for c, _ in h.calls), lambda: f'login_account no llegó: {[c for c, _ in h.calls if "account" in c]}')
        login = next(a for c, a in h.calls if c == 'login_account')['id']
        h.push_event('account', dict(account=login, kind='confirm', text='ABCD-1234'))
        try:
            expect(page.get_by_text('ABCD-1234').first).to_be_visible(timeout=10000)
            results.append(('PASS', 'el relay simulado entrega el evento `account` (kind confirm) al modal de login'))
        except AssertionError:
            results.append(('PENDING', 'el relay simulado NO entregó el evento `account` al modal'))
    finally:
        browser.close()
        if server:
            server.shutdown()
for status, line in results:
    print(f'{status}: {line}')
print('PASS: ai-providers.browser.py' + ('' if strict else ' (columnas pendientes hasta T2)'))
