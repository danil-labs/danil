"""H-PV2: Configuración → Proveedores de IA en Chromium, con borde y relay simulados.

Sirve la web construida (`pnpm web:build`, carpeta `dist-web/`) con un servidor
estático propio, responde el borde (`route_api`) y el relay (`route_web_socket`)
con el patrón de `window.browser.py`, y mide la pantalla real.

Escenarios (docs/testing/2026-11-19-proveedores-ia.md § anchos W1–W7):
  none, one, four, reconnect, list-fails.

Las columnas de la cuadrícula no existen todavía: contra `dev` esas aserciones van
PENDIENTES (se miden, se imprimen y no fallan). `DANIL_PV2_STRICT=1` las vuelve
obligatorias; se activa cuando llegue la cuadrícula. El contenedor del grupo se
identifica por `[data-provider-group]`: en modo estricto debe existir; sin él
se mide el ancestro `@container` o, si no, el padre de la lista.

  DANIL_WEB_API_ORIGIN=https://edge.danil.ai pnpm web:build
  uv run --with playwright python tests/integration/ai-providers.browser.py

`DANIL_PV2_URL` apunta a otra instancia ya servida en vez de levantar la propia.
`DANIL_PV2_SHOTS=<carpeta>` guarda capturas de cada escenario a 1440 y 1024 px.

Desde T3 (2026-11-19) la pantalla tiene un solo «Agregar cuenta» con selector y
solo enseña los grupos con cuentas, algo vivo o un fallo de lectura: `none` ya no
tiene grupo Codex y el alta entra por el selector (`choose`).
Se necesita `playwright install chromium` una vez.
"""
import functools
import http.server
import json
import os
import subprocess
import threading
import time
import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[4]
desktop = root / 'apps' / 'desktop'
strict = os.environ.get('DANIL_PV2_STRICT') == '1'
MACHINE = 'cmp_abcdefghijklmnopqrstuvwxyz'
WIDTHS = [('W1', 960, 3), ('W2', 768, 3), ('W3', 767, 2), ('W4', 640, 2), ('W5', 512, 2), ('W6', 511, 1), ('W7', 320, 1)]

def head():
    return subprocess.check_output(['git', 'rev-parse', '--short=8', 'HEAD'], cwd=root, text=True).strip()


def built_at():
    index = desktop / 'dist-web' / 'terminus' / 'index.html'
    return datetime.datetime.fromtimestamp(index.stat().st_mtime).isoformat(timespec='seconds') if index.exists() else 'sin dist-web'


# Margen tras las primeras lecturas del workspace. 0 por omisión (3 de 3 corridas pasaron con 0);
# `DANIL_PV2_SETTLE_MS` lo sube para depurar la carrera del router web.
ROUTER_SETTLE_MS = int(os.environ.get('DANIL_PV2_SETTLE_MS', '0'))
# Rutas del borde que `dev` puede pedir y que este arnés contesta 404 a propósito; cualquier otra
# ruta rompe la corrida (`assert_edge`). Cada una puede faltar por esto:
#  - identity/sessions: la ventana la pide para listar sesiones y este arnés no la simula.
#  - identity/organizations: está en el contrato `mvp-v1`, pero esta pantalla no la necesita
#    (una sola organización) y la ventana trata su ausencia como «sin selector».
ABSENT_OK = {'identity/sessions', 'identity/organizations'}

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
        self.sockets = []
        self.absent = set()
        self.unexpected = set()
        self.cursor = 0

    def table(self, command, args):
        s = self.scenario
        provider = args.get('provider')
        if command == 'list_accounts':
            if s.get('fail_list'):
                return ('error', dict(code='command'))
            # Solo Codex tiene cuentas; cada proveedor contesta con su propio nombre.
            return ('ok', dict(listing(s['accounts'] if provider == 'codex' else []), provider=provider))
        if command == 'account_status' and provider != 'codex':
            return ('ok', dict(id=args.get('id'), authenticated=False, detail=''))
        if command == 'account_limits' and provider != 'codex':
            return ('ok', dict(mode='no_account', what='Sin cuenta'))
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
            data = dict(items=[dict(machine_id=MACHINE, name='Danil', state='running', connection='connected', organization_id='org_A', kind='organization')], next_cursor=None)
        elif path == f'machines/{MACHINE}/tickets':
            data = dict(ticket='one-use', url='wss://connect.danil.ai/v1/machines/' + MACHINE + '/session', expires_at='2099-01-01T00:00:00Z')
        else:
            if path in ABSENT_OK:
                self.absent.add(path)
            else:
                self.unexpected.add(path)
            return route.fulfill(status=404, body='')
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data))

    def relay(self, ws):
        self.sockets.append(ws)

        def receive(raw):
            m = json.loads(raw)
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


def assert_edge(h):
    assert not h.unexpected, f'rutas del borde no previstas (404): {sorted(h.unexpected)}'


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
    # Carrera del router web (medida): sin esperar, la primera `list_accounts` llegó antes de que el
    # router supiera qué máquina tiene el workspace y cayó en «Ninguna máquina de la cuenta tiene
    # este workspace». No hay señal observable de eso (vive en el cierre del router). Esperar a
    # `list_session_git` la quitó en 3 de 3 corridas con DANIL_PV2_SETTLE_MS=0; el margen
    # fijo es ROUTER_SETTLE_MS (0 por omisión).
    until(page, lambda: any(c == 'list_session_git' for c, _ in h.calls), lambda: f'el relay no contestó las lecturas del workspace: {h.calls}')
    page.wait_for_timeout(ROUTER_SETTLE_MS)
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
        const tagged = list.closest('[data-provider-group]');
        const box = tagged || list.closest('.\\\\@container') || list.parentElement;
        const cards = [...list.children].filter(x => x.tagName === 'LI');
        const first = Math.min(...cards.map(c => c.getBoundingClientRect().top));
        const row = cards.filter(c => Math.abs(c.getBoundingClientRect().top - first) < 2);
        const inside = (b, c) => b.left >= c.left - 1 && b.right <= c.right + 1 && b.top >= c.top - 1 && b.bottom <= c.bottom + 1;
        const clipped = cards.flatMap(card => [...card.querySelectorAll('button, a[href]')]
            .filter(b => b.getBoundingClientRect().width > 0 && !inside(b.getBoundingClientRect(), card.getBoundingClientRect()))
            .map(b => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)));
        return { cols: new Set(row.map(c => Math.round(c.getBoundingClientRect().left))).size, cards: cards.length, tagged: !!tagged,
          overflow: box.scrollWidth > box.clientWidth + 1, minCard: Math.min(...cards.map(c => c.getBoundingClientRect().width)), clipped };
    }""", identity)


def set_width(page, identity, width):
    page.evaluate("""([identity, width]) => {
        const li = [...document.querySelectorAll('li')].find(x => x.textContent.includes(identity));
        const list = li.parentElement;
        const box = list.closest('[data-provider-group]') || list.closest('.\\\\@container') || list.parentElement;
        box.style.width = width + 'px'; box.style.maxWidth = 'none'; box.style.boxSizing = 'border-box';
    }""", [identity, width])
    page.wait_for_timeout(60)


def choose(page, label):
    """El único «Agregar cuenta» abre el selector; se elige el proveedor por su nombre."""
    dialog = page.locator('[role="dialog"]').first
    trigger = dialog.locator('[data-add-account]')
    expect(trigger).to_have_count(1)
    trigger.click()
    page.locator('[data-add-account-menu] [role="menuitem"]').filter(has_text=label).first.click()
    expect(page.locator('[data-add-account-menu]')).to_have_count(0)


def shoot(page, name):
    folder = os.environ.get('DANIL_PV2_SHOTS')
    if not folder:
        return
    Path(folder).mkdir(parents=True, exist_ok=True)
    for width, height in ((1440, 900), (1024, 768)):
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(150)
        page.screenshot(path=str(Path(folder) / f'{name}-{width}.png'))
    page.set_viewport_size({'width': 1440, 'height': 900})


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
    accounts = h.scenario['accounts']
    if name != 'none':
        expand(page, name)
    if name == 'none':
        # Sin cuentas no hay grupo: el texto de la pantalla y un solo «Agregar cuenta» (P50).
        expect(dialog.get_by_text('Todavía no hay cuentas', exact=False)).to_be_visible()
        expect(dialog.get_by_role('button', name='Agregar cuenta')).to_have_count(1)
        expect(dialog.locator('[data-provider-slot]:not(.hidden)')).to_have_count(0)
        shoot(page, name)
        # P68: selector → Codex → el grupo aparece desplegado y el alta sale una vez.
        choose(page, 'Codex')
        until(page, lambda: any(c == 'add_account' and a.get('provider') == 'codex' for c, a in h.calls), lambda: 'add_account de codex no llegó')
        expect(dialog.locator('[data-provider-slot="codex"]')).to_be_visible()
        assert sum(1 for c, a in h.calls if c == 'add_account') == 1, [c for c, _ in h.calls if 'account' in c]
    elif name == 'list-fails':
        expect(dialog.get_by_text('persona1@ejemplo.com')).to_have_count(0)
        # Falla la lista de Codex (y la del Router): el mensaje queda en el grupo y no hay cuentas inventadas.
        # Un mensaje por proveedor que pidió `list_accounts`, no un número fijo.
        until(page, lambda: dialog.get_by_text('No se pudieron leer las cuentas.').count() == len({a['provider'] for c, a in h.calls if c == 'list_accounts'}),
              lambda: f'{dialog.get_by_text("No se pudieron leer las cuentas.").count()} mensajes para {sorted({a["provider"] for c, a in h.calls if c == "list_accounts"})}')
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
    if name != 'none':
        shoot(page, name)
    if name == 'four':
        identity = 'persona1@ejemplo.com'
        for label, width, expected in WIDTHS:
            set_width(page, identity, width)
            got = columns(page, identity)
            assert got['cards'] >= 4, got
            pending(f'{label} {width}px → {expected} columnas (hoy {got["cols"]})', lambda: _eq(got['cols'], expected))
            pending(f'{label} {width}px tarjetas de al menos 240 px', lambda: _eq_true(got['minCard'] >= 240, got))
            # DEFECTO CONOCIDO de `dev` (medido con minCard 331 a 320 px): el contenedor desborda en horizontal.
            pending(f'{label} {width}px sin desborde horizontal' + (' (DEFECTO CONOCIDO de dev, minCard 331)' if width == 320 else ''), lambda: _eq_true(not got['overflow'], got))
            pending(f'{label} {width}px ningún botón de acción queda recortado', lambda: _eq_true(not got['clipped'], got['clipped']))
            if label == 'W1':
                pending('el contenedor del grupo lleva [data-provider-group]', lambda: _eq_true(got['tagged'], 'falta [data-provider-group]'))
    assert not errors, (errors, sorted(missing))
    assert_edge(h)
    results.append(('PASS', f'{name}: pantalla cargada, grupos y cuotas'))
    return h


def _eq(got, expected):
    assert got == expected, f'{got} != {expected}'


def _eq_true(ok, detail):
    assert ok, detail


print(f'HEAD {head()} · dist-web construido {built_at()} · modo {"estricto" if strict else "normal"}')
with sync_playwright() as p:
    server = None
    base = os.environ.get('DANIL_PV2_URL')
    if not base:
        server = serve()
        base = f'http://127.0.0.1:{server.server_address[1]}/terminus/'
    browser = p.chromium.launch(headless=True)
    try:
        absent_seen = set()
        for name in SCENARIOS:
            absent_seen |= run(browser, base, name).absent
        # El relay simulado entrega el evento `account` al modal de login (aserción dura).
        h = Harness(SCENARIOS['one'])
        page = browser.new_page(locale='es-MX', viewport={'width': 1440, 'height': 900})
        page.route('https://edge.danil.ai/v1/**', h.api)
        page.route_web_socket('wss://connect.danil.ai/**', h.relay)
        open_providers(page, base, h)
        until(page, lambda: any(c == 'list_accounts' and a.get('provider') == 'codex' for c, a in h.calls), lambda: 'sin list_accounts de codex')
        expand(page, 'event')
        choose(page, 'Codex')
        until(page, lambda: any(c == 'login_account' for c, _ in h.calls), lambda: f'login_account no llegó: {[c for c, _ in h.calls if "account" in c]}')
        login = next(a for c, a in h.calls if c == 'login_account')['id']
        h.push_event('account', dict(account=login, kind='confirm', text='ABCD-1234'))
        expect(page.get_by_text('ABCD-1234').first).to_be_visible(timeout=10000)
        results.append(('PASS', 'el relay simulado entrega el evento `account` (kind confirm) al modal de login'))
        assert_edge(h)
        absent_seen |= h.absent
    finally:
        browser.close()
        if server:
            server.shutdown()
for status, line in results:
    print(f'{status}: {line}')
print(f'rutas del borde contestadas 404 a propósito (absent): {sorted(absent_seen)}')
print('PASS: ai-providers.browser.py' + ('' if strict else ' (columnas pendientes hasta que llegue la cuadrícula)'))
