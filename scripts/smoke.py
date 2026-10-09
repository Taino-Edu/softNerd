"""
smoke.py — o site está de pé? (robô de smoke)

Bate nas partes vitais e falha (exit 1) se alguma não responder como deveria.
Só lê: não loga, não cria nada, não mexe em dado — pode rodar em produção a qualquer hora.

Usado em três lugares:
  - CI (job "integração"): contra a API subida no Postgres do próprio CI   → --so-api
  - deploy (deploy.yml): logo depois de subir pra produção
  - robô (smoke.yml): a cada 30 min contra produção; abre/fecha um alerta no GitHub

Uso:  python scripts/smoke.py [--site https://santuarionerd.com.br] [--api URL] [--so-api]
"""
import argparse, json, os, sys, time, urllib.error, urllib.request, uuid

ap = argparse.ArgumentParser()
ap.add_argument('--site', default='https://santuarionerd.com.br')
ap.add_argument('--api', default=None, help='base da API (padrão: o mesmo do --site)')
ap.add_argument('--so-api', action='store_true', help='não confere as páginas do front')
ap.add_argument('--lento-ms', type=int, default=3000, help='acima disso conta como lento (aviso)')
args = ap.parse_args()
API = (args.api or args.site).rstrip('/')
SITE = args.site.rstrip('/')


def pedir(metodo, url, corpo=None):
    req = urllib.request.Request(url, method=metodo, data=corpo,
                                 headers={'User-Agent': 'santuario-smoke/1.0', 'Content-Type': 'application/json'})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(200_000).decode('utf-8', 'replace'), (time.perf_counter() - t0) * 1000
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000).decode('utf-8', 'replace'), (time.perf_counter() - t0) * 1000
    except Exception as e:
        return 0, str(e), (time.perf_counter() - t0) * 1000


def json_ok(chave):
    def conferir(txt):
        try: return chave in json.loads(txt)
        except ValueError: return False
    return conferir


# (nome, método, url, status aceitos, conferência extra do corpo)
CHECAGENS = [
    ('API viva (/health)',              'GET',  f'{API}/health', {200}, lambda t: 'Unhealthy' not in t),
    ('Config do site',                  'GET',  f'{API}/api/site-config', {200}, None),
    ('Campeonatos públicos',            'GET',  f'{API}/api/championship', {200}, lambda t: t.lstrip().startswith('[')),
    ('Produtos',                        'GET',  f'{API}/api/product', {200}, None),
    ('Liga Mensal',                     'GET',  f'{API}/api/liga-mensal', {200}, None),
    ('Login responde (config Google)',  'GET',  f'{API}/api/auth/google/config', {200}, json_ok('clientId')),
    # Torneio inexistente tem que dar 404 limpo — 500 aqui é erro de banco/rota
    ('Liguinha responde',               'GET',  f'{API}/api/torneios/{uuid.uuid4()}', {404}, None),
    # Rota protegida sem login tem que recusar (401), nunca abrir nem quebrar
    ('Rota de admin exige login',       'GET',  f'{API}/api/comanda/dashboard', {401}, None),
    # Tempo real (SignalR) negociando — sem isso o telão e o painel não atualizam
    ('Tempo real da liguinha',          'POST', f'{API}/hubs/torneio/negotiate?negotiateVersion=1', {200}, json_ok('connectionId')),
]
if not args.so_api:
    CHECAGENS += [
        ('Página inicial',              'GET', f'{SITE}/', {200}, lambda t: 'Santu' in t),
        ('Liga (pública)',              'GET', f'{SITE}/liga', {200}, None),
        ('Entrar (login do cliente)',   'GET', f'{SITE}/entrar', {200}, None),
        ('Painel (login)',              'GET', f'{SITE}/login', {200}, None),
    ]

falhas, lentos, linhas = [], [], []
for nome, metodo, url, aceitos, extra in CHECAGENS:
    st, corpo, ms = pedir(metodo, url, b'' if metodo == 'POST' else None)
    ok = st in aceitos and (extra is None or extra(corpo))
    if ok and ms > args.lento_ms: lentos.append(nome)
    if not ok: falhas.append(f'{nome}: HTTP {st or "sem resposta"} em {url}' + ('' if st else f' ({corpo[:120]})'))
    linhas.append(f"| {'✅' if ok else '❌'} | {nome} | {st or '—'} | {ms:.0f} ms |")

relatorio = '\n'.join(['| | Checagem | HTTP | Tempo |', '|---|---|---|---|'] + linhas)
print(relatorio)
if lentos: print('\n⚠ lento (>%d ms): %s' % (args.lento_ms, ', '.join(lentos)))
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
        f.write(f'### Smoke — {SITE if not args.so_api else API}\n\n{relatorio}\n\n')
if falhas:
    print('\n✗ FALHOU:'); [print('  -', f) for f in falhas]
    sys.exit(1)
print('\n✓ tudo de pé')
