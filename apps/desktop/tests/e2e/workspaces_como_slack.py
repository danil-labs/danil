"""E2E de aceptación «workspaces como Slack», contra beta real (WorkOS Production).

Diseño: terminus-workspace `docs/testing/2026-11-21-e2e-workspaces-como-slack.md` (#369).
Regla: decisión `docs/decisions/2026-11-21-workspaces-como-slack.md` § 4 (#368).

Una sola prueba, ocho pasos en orden, un solo contexto de navegador. No es un paso de
`scripts/verify.mjs`: usa red, cuentas reales y beta. Corre en Dev-ci con `devci-run`:

    uv run --with playwright python -m playwright install chromium   # una vez
    WORKSPACES_SLACK_EXPECT=red uv run --with playwright \
        python apps/desktop/tests/e2e/workspaces_como_slack.py

Variables:
  WORKSPACES_SLACK_EXPECT   red | green (obligatoria). Con red la corrida sale 0 solo si un paso
                            1–8 falla por una aserción; 1 si los ocho pasan; 2 si es inválida.
                            Con green: 0 si pasan, 1 si un paso falla, 2 si es inválida.
  DANIL_WEB_URL             origen de la web (por omisión https://beta.danil.ai). Debe estar en
                            ALLOWED_WEB_ORIGINS del borde (beta, alfa-app, preview-front).
  DANIL_EDGE_URL            origen del borde (por omisión https://edge.danil.ai).
  WORKSPACES_SLACK_SECRET   secreto de Secrets Manager con las cuentas
                            (por omisión danil/beta/qa/slack-e2e).
  WORKSPACES_SLACK_CONFIG   alternativa: archivo JSON (modo 600) con el mismo contenido que el
                            secreto más `workos_api_key`. Para máquinas sin Secrets Manager.
  WORKSPACES_SLACK_OUT      carpeta de evidencia (por omisión ~/work/qa/workspaces-como-slack/<UTC>).
  WORKSPACES_SLACK_CLICK_S  umbral de «al instante» por clic (por omisión 1.5, R1).
  DANIL_WEB_DIST            carpeta `dist-web` de una rama. Playwright contesta las peticiones a
                            DANIL_WEB_URL con esos archivos (index.html para rutas sin archivo,
                            como not_found_handling=single-page-application, y el CSP del <meta>
                            como cabecera). El origen sigue siendo el real: borde, cookie e
                            identity no cambian; la página es la de la rama.

La entrada es por Magic Auth en AuthKit hospedado: el arnés pide el código que AuthKit acaba de
generar a la API de WorkOS (evento `magic_auth.created` → `GET /user_management/magic_auth/{id}`)
y lo teclea. Nunca imprime ni guarda códigos, contraseñas ni llaves.
"""
from __future__ import annotations

import datetime as dt
import json
import mimetypes
import os
import re
import stat
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

# --- Salidas (§ 6) --------------------------------------------------------------------------

PASS, RED, INVALID = 'pass', 'red', 'invalid'


def exit_code(expect: str, outcome: str) -> int:
    """§ 6: con red, 0 solo si falló una aserción de un paso 1–8 (como xfail(strict=True))."""
    if outcome == INVALID:
        return 2
    if expect == 'red':
        return 0 if outcome == RED else 1
    return 0 if outcome == PASS else 1


class StepFailed(Exception):
    """Una aserción de § 5 no se cumplió: la prueba está en rojo en ese paso."""


class Invalid(Exception):
    """Precondición, entrada o arnés roto: la corrida no dice nada del producto."""


# --- Configuración --------------------------------------------------------------------------

WEB = os.environ.get('DANIL_WEB_URL', 'https://beta.danil.ai').rstrip('/')
EDGE = os.environ.get('DANIL_EDGE_URL', 'https://edge.danil.ai').rstrip('/')
CLICK_S = float(os.environ.get('WORKSPACES_SLACK_CLICK_S', '1.5'))
SLOW_S = 15.0  # tope para distinguir «lento» de «no abrió»; lo que pase de CLICK_S ya es rojo
ROUND_TRIPS = 10
X_ROUNDS = 3

# Textos de G2 (§ 5), en español y en inglés.
G2 = re.compile(
    r'Could not switch organization|No se pudo cambiar (de|la) organizaci[oó]n|No tienes acceso|'
    r'no access|Forbidden|Prohibido|You don.t have access',
    re.I,
)
# G4: rutas que cambian la organización activa de la sesión (marca del modelo viejo, decisión § 5).
G4 = re.compile(r'/organizations/select\b')
# Un contexto vencido o perdido a mitad de la prueba no se esconde como una fila sin tareas.
REAUTH = re.compile(r'Vuelve a entrar a esta organizaci[oó]n', re.I)
CHALLENGE = re.compile(r'asegurarnos de que eres humano|verify (that )?you are (a )?human|Verifique que es un ser humano', re.I)
TASKS = re.compile(r'Todavía no hay tareas|Sin tareas todavía|No hay tareas con estos filtros|No tasks yet|^Tareas$|^Tasks$')


def load_config() -> dict:
    path = os.environ.get('WORKSPACES_SLACK_CONFIG')
    if path:
        p = Path(path)
        if p.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
            raise Invalid(f'{path} debe ser modo 600')
        cfg = json.loads(p.read_text())
    else:
        name = os.environ.get('WORKSPACES_SLACK_SECRET', 'danil/beta/qa/slack-e2e')
        cfg = json.loads(_secret(name))
        if 'workos_api_key' not in cfg:
            cfg['workos_api_key'] = json.loads(_secret('danil/beta/platform/workos'))['api_key']
    names = cfg.setdefault('names', {})
    names.setdefault('a_personal', 'QA A personal')
    names.setdefault('x1', 'QA X1')
    names.setdefault('x2', 'QA X2')
    names.setdefault('b_personal', 'QA B personal')
    for k in ('a_org', 'x_org', 'b_org', 'machine'):
        if not names.get(k):
            raise Invalid(f'falta names.{k} en la configuración de cuentas')
    for k in ('a', 'b'):
        if not cfg.get(k, {}).get('email'):
            raise Invalid(f'falta {k}.email en la configuración de cuentas')
    return cfg


def _secret(name: str) -> str:
    try:
        return subprocess.check_output(
            ['aws', 'secretsmanager', 'get-secret-value', '--region', 'us-east-1', '--secret-id', name,
             '--query', 'SecretString', '--output', 'text'], text=True, stderr=subprocess.PIPE)
    except (OSError, subprocess.CalledProcessError) as e:
        raise Invalid(f'no se pudo leer el secreto {name}: {getattr(e, "stderr", "") or e}'.strip()) from None


# --- WorkOS: código de Magic Auth ----------------------------------------------------------

class WorkOS:
    def __init__(self, key: str):
        self.key = key
        self.requested: list[dict] = []  # se anota cada código pedido (§ 10), sin el código

    def _get(self, path: str) -> dict:
        req = urllib.request.Request('https://api.workos.com' + path, headers={
            'Authorization': 'Bearer ' + self.key, 'User-Agent': 'danil-qa-e2e'})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise Invalid(f'WorkOS {path.split("?")[0]} respondió {e.code}') from None

    def code_for(self, email: str, since: dt.datetime, timeout: float = 45) -> str:
        """El código del Magic Auth que AuthKit creó para `email` después de `since`."""
        start = since.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        deadline = time.time() + timeout
        while time.time() < deadline:
            q = urllib.parse.urlencode({'events': 'magic_auth.created', 'range_start': start, 'limit': 100})
            for ev in reversed(self._get('/events?' + q).get('data', [])):
                d = ev.get('data', {})
                if d.get('email', '').lower() == email.lower():
                    code = self._get('/user_management/magic_auth/' + d['id']).get('code')
                    if code:
                        self.requested.append({'email': email, 'magic_auth_id': d['id'], 'at': ev.get('created_at')})
                        return code
            time.sleep(2)
        raise Invalid(f'WorkOS no mostró un magic_auth.created para {email} en {timeout:.0f} s')


# --- Registro de la corrida ----------------------------------------------------------------

@dataclass
class Run:
    out: Path
    expect: str
    steps: list = field(default_factory=list)
    clicks: list = field(default_factory=list)
    edge: list = field(default_factory=list)  # respuestas del borde, en orden
    requests: list = field(default_factory=list)
    step: str = '0'
    guard_from: int = 0  # índice de `edge` desde el que aplica G1 (tras entrar)
    notes: dict = field(default_factory=dict)

    def on_response(self, r):
        if r.url.startswith(EDGE + '/v1/'):
            self.edge.append({'step': self.step, 't': round(time.time(), 3), 'status': r.status,
                              'method': r.request.method, 'path': r.url[len(EDGE):].split('?')[0]})

    def on_request(self, r):
        if r.url.startswith(EDGE + '/v1/'):
            self.requests.append({'step': self.step, 'method': r.method, 'path': r.url[len(EDGE):].split('?')[0]})


def guards(page, run: Run, mark: int, label: str, rail_check: bool = True):
    """G1–G4 sobre lo ocurrido desde `mark` (índice en run.edge) y la pantalla actual."""
    bad = [e for e in run.edge[max(mark, run.guard_from):] if e['status'] in (401, 403) or e['status'] >= 500]
    if bad:
        raise StepFailed(f'G1 en {label}: ' + ', '.join(f"{e['status']} {e['method']} {e['path']}" for e in bad[:5]))
    reauth = page.locator('[data-web-reauth-sign-in]').or_(page.get_by_text(REAUTH)).first
    if reauth.count() and reauth.is_visible():
        org = reauth.evaluate("(el) => { const g = el.closest('[role=group]'); "
                              "return (g && g.getAttribute('aria-label')) || ''; }") or '¿org?'
        raise StepFailed(f'apareció volver a iniciar sesión en {org} ({label})')
    text = page.locator('body').inner_text(timeout=5000)
    m = G2.search(text)
    if m:
        raise StepFailed(f'G2 en {label}: se ve «{m.group(0)}»')
    if rail_check:
        disabled = rail(page).locator('button[disabled], [aria-disabled="true"]')
        if disabled.count():
            names = [disabled.nth(i).get_attribute('aria-label') or disabled.nth(i).inner_text()[:60]
                     for i in range(min(disabled.count(), 5))]
            raise StepFailed(f'G3 en {label}: filas o botones desactivados en el riel: {names}')
    sel = [q for q in run.requests if G4.search(q['path'])]
    if sel:
        raise StepFailed(f'G4 en {label}: {sel[0]["method"]} {sel[0]["path"]} (paso {sel[0]["step"]})')


# --- Localizadores por rol y texto (§ 5) ---------------------------------------------------

def rail(page):
    return page.get_by_role('navigation', name='Workspaces').or_(page.locator('[aria-label="Workspaces"]')).first


def tile(page, name: str, email: str | None = None):
    """Cuadro del riel: button cuyo nombre accesible es «{nombre}, {correo}» (o lleva el nombre)."""
    pat = re.escape(name) + (r'.*' + re.escape(email) if email else '')
    return rail(page).get_by_role('button', name=re.compile(pat)).or_(
        rail(page).get_by_role('link', name=re.compile(pat))).first


def reveal(page, name: str, email: str | None = None):
    """Con varios workspaces de una org, el riel los apila: abre las pilas hasta ver el cuadro."""
    t = tile(page, name, email)
    if t.is_visible():
        return t
    stacks = rail(page).locator('[data-org-stack]')
    for i in range(stacks.count()):
        st = stacks.nth(i)
        if st.is_visible():
            st.click()
            try:
                t.wait_for(state='visible', timeout=1000)
                return t
            except Exception:
                page.keyboard.press('Escape')
    return t


def rail_rows(page) -> list[str]:
    """La lista ordenada del riel: nombre accesible de cada fila, sin los botones de agregar."""
    r = rail(page)
    out = []
    for loc in r.get_by_role('button').all() + r.get_by_role('link').all():
        n = (loc.get_attribute('aria-label') or loc.inner_text()).strip()
        if n and not re.match(r'^(\+|Agregar|Add|Conectar otra cuenta)', n):
            out.append(n)
    return out


def org_of_row(page, name: str) -> str:
    """La organización de la fila: nombre accesible del ancestro role=group (o, si no hay,
    el texto del grupo que contiene el cuadro)."""
    reveal(page, name)
    return tile(page, name).evaluate(
        """(el) => { const g = el.closest('[role=group]');
              if (g) return (g.getAttribute('aria-label') || '') + '\\n' + (g.innerText || '');
              let n = el.parentElement;
              for (let i = 0; i < 6 && n; i++, n = n.parentElement)
                if ((n.innerText || '').split('\\n').length > 1) return n.innerText;
              return el.getAttribute('aria-label') || el.innerText; }""")


def open_and_time(page, run: Run, name: str, org: str, email: str | None = None) -> float:
    """Clic en la fila y espera la lista de tareas de ese workspace. Devuelve segundos."""
    target = reveal(page, name, email)
    if not target.is_visible():
        raise StepFailed(f'la fila «{name}» no está en el riel')
    t0 = time.monotonic()
    target.click()
    deadline = t0 + SLOW_S
    while time.monotonic() < deadline:
        if _opened(page, name, org):
            took = time.monotonic() - t0
            run.clicks.append({'step': run.step, 'workspace': name, 'org': org, 'seconds': round(took, 3)})
            return took
        page.wait_for_timeout(50)
    run.clicks.append({'step': run.step, 'workspace': name, 'org': org, 'seconds': None})
    raise StepFailed(f'«{name}» no mostró su lista de tareas con «{org}» en el encabezado en {SLOW_S:.0f} s')


def _opened(page, name: str, org: str) -> bool:
    current = rail(page).locator('[aria-current="true"], [aria-current="page"]').first
    try:
        if current.count() and name not in (current.get_attribute('aria-label', timeout=200) or current.inner_text(timeout=200)):
            return False
    except Exception:
        pass
    head = page.get_by_role('banner').or_(page.locator('header')).first
    try:
        htext = head.inner_text(timeout=200)
    except Exception:
        return False
    if name not in htext or org not in htext:
        return False
    return page.get_by_text(TASKS).first.is_visible() or page.get_by_role('list', name=re.compile('Tareas|Tasks')).first.is_visible()


def within(run: Run, took: float, name: str):
    if took > CLICK_S:
        raise StepFailed(f'«{name}» abrió en {took:.2f} s (> {CLICK_S} s)')


# --- Entrada por AuthKit + Magic Auth ------------------------------------------------------

def sign_in(page, wos: WorkOS, email: str):
    """De la pantalla de entrada de Danil (o de AuthKit) hasta volver a la web con sesión."""
    if not page.url.startswith('https://') or 'authkit' not in page.url:
        entry = page.get_by_role('button', name=re.compile('Continuar con tu correo|Continue with (your )?email', re.I)).or_(
            page.get_by_role('link', name=re.compile('Continuar con tu correo|Continue with (your )?email', re.I))).first
        try:
            entry.click(timeout=20000)
        except Exception:
            raise Invalid('la web no mostró «Continuar con tu correo» en 20 s: no hay cómo entrar') from None
    page.wait_for_url(re.compile(r'authkit'), timeout=30000)
    box = page.get_by_role('textbox', name=re.compile('Correo|Email', re.I)).first
    box.fill(email, timeout=20000)
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=5)
    page.get_by_role('button', name=re.compile(r'^(Continuar|Continue)', re.I)).first.click()
    code_btn = page.get_by_role('button', name=re.compile('Código de acceso por email|Email sign-in code|Email code', re.I)).first
    deadline = time.time() + 30
    while time.time() < deadline:
        body = page.locator('body').inner_text()
        if CHALLENGE.search(body):
            raise Invalid('AuthKit pidió el reto anti-bots (WorkOS Radar, Turnstile): falta permitir '
                          f'{email} en la lista Allow de Radar de Production')
        if code_btn.is_visible():
            since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=5)
            code_btn.click()
            break
        if re.search(r'c[oó]digo|code', body, re.I) and page.locator('input').count() >= 1 and 'password' not in page.url:
            break
        page.wait_for_timeout(300)
    page.wait_for_timeout(1500)
    if CHALLENGE.search(page.locator('body').inner_text()):
        raise Invalid('AuthKit pidió el reto anti-bots (WorkOS Radar, Turnstile) antes del código')
    code = wos.code_for(email, since)
    first = page.locator('input:not([type=hidden]):not([type=email])').first
    first.click()
    page.keyboard.type(code, delay=40)
    page.keyboard.press('Enter')
    try:
        page.wait_for_url(lambda u: u.startswith(WEB), timeout=45000)
    except Exception:
        raise Invalid(f'la entrada de {email} no volvió a {WEB} (url {page.url.split("?")[0]})') from None


# --- Pasos ---------------------------------------------------------------------------------

def step(run: Run, page, n: str, title: str, fn):
    run.step = n
    t0 = time.time()
    rec = {'step': n, 'title': title, 'started_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
    run.steps.append(rec)
    try:
        fn()
        rec['result'] = 'pass'
    except StepFailed as e:
        rec['result'], rec['assertion'] = 'red', str(e)
        raise
    except Invalid as e:
        rec['result'], rec['reason'] = 'invalid', str(e)
        raise
    except Exception as e:  # el arnés se rompió (timeout, selector, red): inválida, no roja
        rec['result'], rec['reason'] = 'invalid', f'{type(e).__name__}: {str(e).splitlines()[0][:400]}'
        raise Invalid(rec['reason']) from e
    finally:
        rec['seconds'] = round(time.time() - t0, 2)
        rec['url'] = page.url.split('?')[0]
        shot = f'paso-{n}.png'
        try:
            page.screenshot(path=str(run.out / shot), full_page=True)
            rec['screenshot'] = shot
        except Exception:
            pass


def scenario(page, run: Run, cfg: dict, wos: WorkOS):
    N = cfg['names']
    a, b = cfg['a']['email'], cfg['b']['email']
    A, X1, X2, B = N['a_personal'], N['x1'], N['x2'], N['b_personal']
    A_ORG, X_ORG, B_ORG = N['a_org'], N['x_org'], N['b_org']

    def s0():
        run.notes['web'] = WEB
        run.notes['edge'] = EDGE
        if page.context.cookies():
            raise Invalid('el contexto no está limpio: ya tiene cookies')
        page.goto(WEB + '/', wait_until='domcontentloaded')
        page.wait_for_timeout(3000)
        # Sin sesiones, el modelo viejo responde 401 en identity/me; el nuevo puede no llamar al
        # borde. Solo se anota: la precondición es el contexto sin cookies.
        run.notes['unauthenticated_edge'] = [e for e in run.edge if e['step'] == '0']
        run.notes['versions'] = versions(page)

    def s1():
        sign_in(page, wos, a)
        run.guard_from = len(run.edge)
        mark = len(run.edge)
        for name in (A, X1, X2):
            expect_visible(page, name, f'tras entrar con A, el riel o el catálogo no muestra «{name}»')
        if page.get_by_text(re.compile('Elegir organización|Choose (an )?organization', re.I)).first.is_visible():
            raise StepFailed('aparece una segunda pantalla para elegir organización dentro de Danil')
        for name, org in ((A, A_ORG), (X1, X_ORG), (X2, X_ORG)):
            if reveal(page, name).is_visible() and org not in org_of_row(page, name):
                raise StepFailed(f'la fila «{name}» no lleva el nombre de su organización «{org}»')
        guards(page, run, mark, 'paso 1', rail_check=False)

    def s2():
        mark = len(run.edge)
        for name in (X1, A):
            add_from_plus(page, name)
        for name, org in ((X1, X_ORG), (A, A_ORG)):
            if not reveal(page, name).is_visible():
                raise StepFailed(f'«{name}» no quedó en el riel')
            if org not in org_of_row(page, name):
                raise StepFailed(f'«{name}» quedó en el riel sin su organización «{org}»')
        guards(page, run, mark, 'paso 2')

    def s3():
        mark = len(run.edge)
        within(run, open_and_time(page, run, A, A_ORG), A)
        guards(page, run, mark, 'paso 3')

    def s4():
        for i in range(ROUND_TRIPS):
            for name, org in ((X1, X_ORG), (A, A_ORG)):
                mark = len(run.edge)
                within(run, open_and_time(page, run, name, org), name)
                guards(page, run, mark, f'paso 4, vuelta {i + 1}, «{name}»')

    def s5():
        add_from_plus(page, X2)
        seen = {}
        for i in range(X_ROUNDS):
            for name in (X1, X2):
                mark = len(run.edge)
                open_and_time(page, run, name, X_ORG)
                guards(page, run, mark, f'paso 5, vuelta {i + 1}, «{name}»')
                seen.setdefault(name, set()).add(main_text(page))
        if seen[X1] & seen[X2]:
            raise StepFailed(f'«{X1}» y «{X2}» muestran el mismo contenido (se mezclan)')

    def s6():
        mark = len(run.edge)
        add_account(page, wos, b)
        expect_visible(page, B, f'«{B}» no aparece en el riel tras entrar con B')
        if b not in rail(page).inner_text():
            raise StepFailed(f'el riel no muestra el correo de B ({b})')
        open_and_time(page, run, B, B_ORG)
        took = open_and_time(page, run, A, A_ORG)
        if 'authkit' in page.url:
            raise StepFailed('volver a A pidió entrar otra vez: la sesión de A no siguió viva')
        within(run, took, A)
        guards(page, run, mark, 'paso 6')

    def s7():
        before = rail_rows(page)
        run.notes['rail_before_reload'] = before
        page.reload(wait_until='domcontentloaded')
        expect_visible(page, A, 'tras recargar, el riel no volvió')
        mark = len(run.edge)
        page.wait_for_timeout(1500)
        after = rail_rows(page)
        run.notes['rail_after_reload'] = after
        if before != after:
            raise StepFailed(f'el riel cambió al recargar: antes {before}, después {after}')
        for name, org in ((A, A_ORG), (B, B_ORG)):
            open_and_time(page, run, name, org)
            if 'authkit' in page.url:
                raise StepFailed(f'tras recargar, abrir «{name}» pidió entrar otra vez')
        guards(page, run, mark, 'paso 7')

    def s8():
        mark = len(run.edge)
        if not reveal(page, X2).is_visible():
            raise StepFailed(f'«{X2}» ya no está en el riel')
        open_and_time(page, run, X2, X_ORG)
        page.wait_for_timeout(2000)
        machine = N['machine']
        online = [e for e in run.notes.get('computers', []) if e.get('name') == machine and e.get('state') == 'online']
        if online:
            raise Invalid(f'la máquina «{machine}» de {X2} está online: la corrida no prueba el paso 8')
        notice = page.get_by_text(re.compile(r'apagad|desconectad|offline|turned off', re.I)).filter(
            has_text=machine).first
        if not notice.is_visible():
            raise StepFailed(f'no hay un aviso visible de máquina apagada que nombre «{machine}»')
        run.notes['machine_notice'] = notice.inner_text()[:500]
        guards(page, run, mark, 'paso 8', rail_check=True)

    for n, title, fn in (
        ('0', 'Precondiciones', s0), ('1', 'Entra con A', s1),
        ('2', '«+» agrega X1 y la personal de A', s2), ('3', 'Clic en la personal de A', s3),
        ('4', 'X1 ↔ personal de A, 10 vueltas', s4), ('5', 'Agrega X2; X1 ↔ X2, 3 vueltas', s5),
        ('6', 'Agrega el correo B y vuelve a A', s6), ('7', 'Recarga', s7),
        ('8', 'X2 con la máquina apagada', s8),
    ):
        try:
            step(run, page, n, title, fn)
        except StepFailed:
            if n == '0':
                raise Invalid(run.steps[-1].get('assertion', 'precondición')) from None
            raise


def expect_visible(page, name: str, msg: str):
    try:
        page.get_by_text(name, exact=False).first.wait_for(state='visible', timeout=20000)
    except Exception:
        raise StepFailed(msg) from None


def add_from_plus(page, name: str):
    """«+» del riel → elegir el workspace por su nombre."""
    if reveal(page, name).is_visible():
        return
    plus = rail(page).get_by_role('button', name=re.compile(r'^(\+|Agregar workspace|Add workspace)', re.I)).first
    try:
        plus.click(timeout=10000)
    except Exception:
        raise StepFailed('no hay botón «+» (Agregar workspace) en el riel') from None
    pick = page.get_by_role('button', name=re.compile(r'Agregar ' + re.escape(name))).or_(
        page.get_by_role('menuitem', name=re.compile(re.escape(name)))).or_(
        page.get_by_role('option', name=re.compile(re.escape(name)))).first
    try:
        pick.click(timeout=10000)
    except Exception:
        raise StepFailed(f'«+» no ofrece «{name}»') from None
    try:
        tile(page, name).wait_for(state='visible', timeout=10000)
    except Exception:
        raise StepFailed(f'«{name}» no quedó en el riel tras agregarlo') from None


def add_account(page, wos: WorkOS, email: str):
    btn = page.get_by_role('button', name=re.compile('Agregar cuenta|Conectar otra cuenta|Add account', re.I)).or_(
        page.get_by_role('link', name=re.compile('Agregar cuenta|Conectar otra cuenta|Add account', re.I))).first
    try:
        btn.click(timeout=10000)
    except Exception:
        # Puede vivir dentro del menú de «+».
        try:
            rail(page).get_by_role('button', name=re.compile(r'^(\+|Agregar workspace)', re.I)).first.click(timeout=5000)
            btn.click(timeout=5000)
        except Exception:
            raise StepFailed('no hay «Agregar cuenta» en la web') from None
    sign_in(page, wos, email)


def main_text(page) -> str:
    try:
        return page.get_by_role('main').first.inner_text(timeout=2000)
    except Exception:
        return ''


def versions(page) -> dict:
    """Versiones desplegadas a la vista, con su hora UTC (§ 5, paso 0)."""
    out = {'utc': dt.datetime.now(dt.timezone.utc).isoformat()}
    for name, url in (('edge_capabilities', EDGE + '/v1/capabilities'),):
        try:
            r = page.request.get(url, timeout=10000)
            out[name] = {'status': r.status, 'headers': {k: v for k, v in r.headers.items()
                                                         if re.match(r'(x-|cf-ray|date|server)', k)}}
        except Exception as e:
            out[name] = {'error': type(e).__name__}
    try:
        out['web_assets'] = page.evaluate("[...document.scripts].map(s => s.src).filter(Boolean).slice(0, 5)")
    except Exception:
        pass
    return out


def capture_computers(run: Run):
    def on_response(r):
        if r.url.startswith(EDGE + '/v1/compute/computers') and r.request.method == 'GET' and r.ok:
            try:
                body = r.json()
                run.notes['computers'] = [{'name': c.get('name'), 'state': c.get('state')}
                                          for c in body.get('computers', [])]
            except Exception:
                pass
    return on_response


def _headers_for(path: Path, pattern: str) -> dict:
    """Cabeceras de un bloque de `_headers` (formato de Cloudflare), en minúsculas."""
    out, current = {}, None
    if not path.is_file():
        return out
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line[0].isspace():
            current = line.strip()
        elif current == pattern and ':' in line:
            k, v = line.strip().split(':', 1)
            out[k.strip().lower()] = v.strip()
    return out


def serve_dist(ctx, dist: Path, run: Run):
    """Contesta DANIL_WEB_URL/** con `dist` (SPA): un archivo si existe, si no index.html."""
    dist = dist.resolve()
    index = (dist / 'index.html').read_text()
    m = re.search(r'<meta[^>]+http-equiv=["\']Content-Security-Policy["\'][^>]+content=["\']([^"\']+)', index, re.I)
    base = _headers_for(dist / '_headers', '/*')  # mismas cabeceras que Workers Assets
    if 'content-security-policy' not in base and m:
        base['content-security-policy'] = m.group(1)
    csp = base
    run.notes['web_dist'] = {'path': str(dist), 'headers': sorted(base)}

    def handle(route):
        req = route.request
        if req.method not in ('GET', 'HEAD'):
            return route.continue_()
        rel = urllib.parse.unquote(urllib.parse.urlsplit(req.url).path).lstrip('/')
        f = (dist / rel).resolve()
        if rel and f.is_file() and dist in f.parents:
            ctype = mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
            return route.fulfill(status=200, body=f.read_bytes(), headers={**base, 'content-type': ctype})
        return route.fulfill(status=200, body=index, headers={'content-type': 'text/html; charset=utf-8', **csp})

    ctx.route(WEB + '/**', handle)
    ctx.route(WEB, handle)


# --- Arranque ------------------------------------------------------------------------------

def main() -> int:
    if '--selftest' in sys.argv:
        assert exit_code('red', RED) == 0 and exit_code('red', PASS) == 1 and exit_code('red', INVALID) == 2
        assert exit_code('green', PASS) == 0 and exit_code('green', RED) == 1 and exit_code('green', INVALID) == 2
        print('selftest ok')
        return 0
    expect = os.environ.get('WORKSPACES_SLACK_EXPECT', '')
    if expect not in ('red', 'green'):
        print('WORKSPACES_SLACK_EXPECT debe ser red o green', file=sys.stderr)
        return 2
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out = Path(os.environ.get('WORKSPACES_SLACK_OUT') or Path.home() / 'work/qa/workspaces-como-slack' / stamp)
    out.mkdir(parents=True, exist_ok=True)
    run = Run(out=out, expect=expect)
    outcome, failure = PASS, None
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='es-MX')
        ctx.tracing.start(screenshots=True, snapshots=True)
        if os.environ.get('DANIL_WEB_DIST'):
            dist = Path(os.environ['DANIL_WEB_DIST'])
            if not (dist / 'index.html').is_file():
                print(f'DANIL_WEB_DIST no tiene index.html: {dist}', file=sys.stderr)
                return 2
            serve_dist(ctx, dist, run)
        page = ctx.new_page()
        page.on('response', run.on_response)
        page.on('response', capture_computers(run))
        page.on('request', run.on_request)
        try:
            cfg = load_config()
            wos = WorkOS(cfg.pop('workos_api_key'))
            scenario(page, run, cfg, wos)
            run.notes['magic_auth_requests'] = wos.requested
        except StepFailed as e:
            outcome, failure = RED, str(e)
        except Invalid as e:
            outcome, failure = INVALID, str(e)
            if not run.steps:
                run.steps.append({'step': '0', 'title': 'Precondiciones', 'result': 'invalid', 'reason': failure})
        except Exception as e:
            outcome, failure = INVALID, f'{type(e).__name__}: {e}'
            traceback.print_exc()
        finally:
            ctx.tracing.stop(path=str(out / 'trace.zip'))
            browser.close()
    first_red = next((s for s in run.steps if s.get('result') in ('red', 'invalid')), None)
    code = exit_code(expect, outcome)
    result = {
        'expect': expect, 'outcome': outcome, 'exit_code': code, 'web': WEB, 'edge': EDGE,
        'click_threshold_s': CLICK_S, 'first_failed_step': first_red and first_red['step'],
        'failure': failure, 'url': first_red and first_red.get('url'),
        'screenshot': first_red and first_red.get('screenshot'),
        'last_edge_responses': run.edge[-30:], 'steps': run.steps, 'clicks': run.clicks,
        'org_switch_calls': [q for q in run.requests if G4.search(q['path'])],
        'notes': run.notes,
    }
    (out / 'resultado.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f'{outcome} (esperado {expect}) → salida {code}; paso {result["first_failed_step"]}: {failure}')
    print(f'evidencia: {out}')
    return code


if __name__ == '__main__':
    sys.exit(main())
