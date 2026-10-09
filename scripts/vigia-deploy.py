"""
vigia-deploy.py — o site caiu durante o deploy? Mede, pedido por pedido.

Fica batendo nas partes vitais (API, tempo real, front) sem parar enquanto um deploy
acontece e, no fim, conta quantos pedidos falharam e por quanto tempo. Serve pra
provar a troca sem queda (deploy/rollout.sh): o resultado esperado é 0 falha.

Só lê (GET e a negociação do tempo real): pode rodar contra produção.

Uso:
  python scripts/vigia-deploy.py --segundos 120                       # produção
  (o deploy.yml roda sozinho em todo deploy e põe o resultado no resumo)
  python scripts/vigia-deploy.py --site http://localhost:8088 --host santuarionerd.com.br
Rode e, em outro terminal, dispare o deploy.
"""
import argparse, collections, os, threading, time, urllib.error, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--site', default='https://santuarionerd.com.br')
ap.add_argument('--host', default=None, help='cabeçalho Host (teste local atrás do nginx)')
ap.add_argument('--segundos', type=int, default=120, help='tempo máximo vigiando')
ap.add_argument('--parar-quando-existir', default=None,
                help='encerra antes do tempo quando este arquivo aparecer (o deploy.yml cria ao terminar)')
ap.add_argument('--por-segundo', type=float, default=1,
                help='pedidos por segundo em cada rota (acima de ~1 a API barra o IP com 429: 200/min)')
args = ap.parse_args()
SITE = args.site.rstrip('/')

ROTAS = [
    ('API /health',            'GET',  '/health'),
    ('API Liga Mensal',        'GET',  '/api/liga-mensal'),
    ('API chaves',             'GET',  '/api/funcionalidades'),
    ('Tempo real (negociar)',  'POST', '/hubs/torneio/negotiate?negotiateVersion=1'),
    ('Front: página inicial',  'GET',  '/'),
    ('Front: arquivo',         'GET',  '/manifest.json'),
]

resultados = collections.defaultdict(list)  # rota -> [(instante, status, ms)]
trava = threading.Lock()
fim = time.time() + args.segundos


def pedir(metodo, caminho):
    headers = {'User-Agent': 'santuario-vigia/1.0'}
    if args.host: headers['Host'] = args.host
    req = urllib.request.Request(SITE + caminho, method=metodo, headers=headers,
                                 data=b'' if metodo == 'POST' else None)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read(1)
            return r.status, (time.perf_counter() - t0) * 1000
    except urllib.error.HTTPError as e:
        return e.code, (time.perf_counter() - t0) * 1000
    except Exception:
        return 0, (time.perf_counter() - t0) * 1000


def acabou():
    return time.time() >= fim or (args.parar_quando_existir and os.path.exists(args.parar_quando_existir))


def vigiar(nome, metodo, caminho):
    intervalo = 1 / args.por_segundo
    while not acabou():
        t = time.time()
        st, ms = pedir(metodo, caminho)
        with trava: resultados[nome].append((t, st, ms))
        time.sleep(max(0, intervalo - (time.time() - t)))


threads = [threading.Thread(target=vigiar, args=r, daemon=True) for r in ROTAS]
inicio = time.time()
print(f'vigiando {SITE} por {args.segundos}s ({len(ROTAS)} rotas × {args.por_segundo}/s)… dispare o deploy agora')
for t in threads: t.start()
for t in threads: t.join()

total_falhas = 0
print(f"\n| Rota | Pedidos | Falhas | Barrados (429) | Mais lento | Janela com falha |\n|---|---|---|---|---|---|")
for nome, _, _ in ROTAS:
    linhas = resultados[nome]
    # 429 = limite de requisições da própria API (o vigia pediu demais), não queda
    limitados = sum(1 for _, st, _ in linhas if st == 429)
    ruins = [(t, st) for t, st, _ in linhas if not (200 <= st < 400) and st != 429]
    total_falhas += len(ruins)
    janela = f"{ruins[0][0] - inicio:.0f}s → {ruins[-1][0] - inicio:.0f}s ({', '.join(sorted({str(s or 'sem resposta') for _, s in ruins}))})" if ruins else '—'
    lento = max((ms for _, _, ms in linhas), default=0)
    print(f"| {nome} | {len(linhas)} | {len(ruins)} | {limitados} | {lento:.0f} ms | {janela} |")

print('\n✓ nenhuma falha durante o deploy' if total_falhas == 0 else f'\n✗ {total_falhas} pedidos falharam')
raise SystemExit(1 if total_falhas else 0)
