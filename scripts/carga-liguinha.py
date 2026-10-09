"""
carga-liguinha.py — teste de carga LOCAL da liguinha (dia de torneio na loja)

Simula N jogadores com celular, todos saindo do MESMO IP (como no wi-fi da loja):
  1. todos entram na conta ao mesmo tempo
  2. todos digitam o código do torneio
  3. a cada rodada: os dois jogadores de cada mesa lançam o resultado AO MESMO TEMPO
     (corrida pra fechar a partida), ~10% lançam divergente (o organizador resolve).
     As mesas terminam espalhadas em --ritmo segundos (0 = todas juntas, pior caso) e,
     como no celular (lib/useTorneioAoVivo.ts), cada tela recarrega no máximo uma vez
     a cada 1,5 s depois de um aviso
  4. dois cliques simultâneos em "gerar rodada" (tem que sair uma só)
  5. encerra e confere a integridade (colocações, pontos, partidas fechadas)

Só roda contra localhost: cria campeonato e contas de teste.

Uso:  python scripts/carga-liguinha.py [--jogadores 24] [--rodadas 4] [--ritmo 30] [--api http://localhost:5000]
Admin: ADMIN_EMAIL / ADMIN_PASSWORD no ambiente (padrão: o seed de desenvolvimento).
"""
import argparse, concurrent.futures as cf, http.cookiejar, json, os, random, secrets, statistics, sys, time
import threading, urllib.error, urllib.parse, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

ap = argparse.ArgumentParser()
ap.add_argument('--jogadores', type=int, default=24)
ap.add_argument('--rodadas', type=int, default=None)
ap.add_argument('--api', default='http://localhost:5000')
ap.add_argument('--divergencia', type=float, default=0.10)
ap.add_argument('--ritmo', type=float, default=30, help='segundos em que as mesas de uma rodada terminam')
ap.add_argument('--manter', action='store_true', help='não apaga o campeonato e o timer de teste no fim')
args = ap.parse_args()

if urllib.parse.urlparse(args.api).hostname not in ('localhost', '127.0.0.1', '::1'):
    sys.exit('Só roda contra localhost (cria contas e campeonato de teste).')

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@cardgamestore.com.br')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'SenhaForte@123')  # seed de dev (Data/InicializacaoBanco.cs)

lat = defaultdict(list)      # rota -> [ms]
instantes = []               # quando cada requisição saiu (pico por minuto, limite por IP)
status = defaultdict(Counter)  # rota -> {status: n}
trava = threading.Lock()


class Cliente:
    def __init__(self, nome):
        self.nome = nome
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def req(self, metodo, rota, corpo=None, rotulo=None):
        rotulo = rotulo or rota
        r = urllib.request.Request(args.api + rota, method=metodo,
                                   data=json.dumps(corpo).encode() if corpo is not None else None,
                                   headers={'Content-Type': 'application/json'})
        t0 = time.perf_counter()
        try:
            with self.op.open(r, timeout=30) as resp:
                txt = resp.read().decode()
                st = resp.status
        except urllib.error.HTTPError as e:
            txt, st = e.read().decode(), e.code
        except Exception as e:  # timeout, conexão recusada
            txt, st = str(e), 0
        ms = (time.perf_counter() - t0) * 1000
        with trava:
            instantes.append(t0)
            lat[rotulo].append(ms)
            status[rotulo][st] += 1
        try:
            dados = json.loads(txt) if txt else None
        except ValueError:
            dados = txt
        return st, dados


def em_paralelo(fn, itens, workers=64):
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(fn, itens))


def etapa(titulo):
    print(f'\n── {titulo} ' + '─' * max(0, 60 - len(titulo)))


# ── Preparação ───────────────────────────────────────────────────────────────
etapa('Preparação')
adm = Cliente('admin')
st, _ = adm.req('POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, 'login admin')
if st != 200: sys.exit(f'Login do admin falhou ({st}).')

rodada_id = datetime.now().strftime('%H%M%S')
st, ch = adm.req('POST', '/api/championship', {
    'name': f'Carga liguinha {rodada_id}', 'game': 'Pokemon',
    'startDate': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'entryFeeInCents': 0, 'maxParticipants': 256})
if st >= 300: sys.exit(f'Não criou o campeonato: {st} {ch}')
cid = ch['id']
adm.req('PUT', f'/api/championship/{cid}/status', {'status': 'Inscricoes'})

senha = secrets.token_urlsafe(12) + 'Aa1!'   # gerada aqui, nunca impressa
jogadores = []
def criar(i):
    email = f'carga{rodada_id}-{i}@teste.local'
    st, u = adm.req('POST', '/api/user', {'name': f'Carga {i:02d}', 'email': email, 'password': senha, 'role': 'Customer'}, 'criar conta')
    return (email, u['id']) if st < 300 else None
for r in em_paralelo(criar, range(1, args.jogadores + 1), workers=8):
    if r: jogadores.append({'email': r[0], 'userId': r[1], 'cli': Cliente(r[0])})
print(f'campeonato {cid} · {len(jogadores)} contas criadas')

# ── 1. Todo mundo entra na conta ao mesmo tempo ─────────────────────────────
etapa(f'1. {len(jogadores)} logins simultâneos (mesmo IP)')
def logar(j):
    st, _ = j['cli'].req('POST', '/api/auth/login', {'email': j['email'], 'password': senha}, 'login jogador')
    j['logado'] = st == 200
    return st
print('status:', dict(Counter(em_paralelo(logar, jogadores))))
logados = [j for j in jogadores if j['logado']]
if len(logados) < len(jogadores):
    print(f'⚠ {len(jogadores) - len(logados)} jogador(es) NÃO conseguiram entrar — tentando de novo em 61 s pra seguir o teste')
    time.sleep(61)
    for j in [j for j in jogadores if not j['logado']]:
        logar(j)
    logados = [j for j in jogadores if j['logado']]
print(f'{len(logados)} logados')

# ── 2. Código do torneio ─────────────────────────────────────────────────────
etapa('2. Check-in pelo código (todos juntos)')
st, prep = adm.req('POST', f'/api/torneios/{cid}/preparar', {'melhorDe': 1, 'minutosRodada': 30})
codigo = prep['codigoEntrada']
decks = ['Charizard ex', 'Gardevoir ex', 'Lost Box', 'Dragapult ex', 'Raging Bolt', 'Gholdengo ex', 'Regidrago']
print('status:', dict(Counter(em_paralelo(
    lambda j: j['cli'].req('POST', '/api/torneios/entrar', {'codigo': codigo, 'deckNome': random.choice(decks)}, 'entrar')[0],
    logados))))
por_user = {j['userId']: j for j in logados}

# ── 3. Rodadas ───────────────────────────────────────────────────────────────
def todos_recarregam():
    """O que um aviso do hub causa: cada celular busca a mesa de novo + o telão."""
    em_paralelo(lambda j: j['cli'].req('GET', f'/api/torneios/{cid}/minha-mesa', rotulo='minha-mesa (recarga)'), logados)
    adm.req('GET', f'/api/torneios/{cid}', rotulo='telão')

aviso = threading.Event()     # "chegou TorneioAtualizado"
fim_hub = threading.Event()
def hub_simulado():
    """Avisos em sequência viram uma recarga só, no máximo a cada 1,5 s (useTorneioAoVivo)."""
    while not fim_hub.is_set():
        if aviso.wait(0.2):
            time.sleep(1.5)
            aviso.clear()
            todos_recarregam()
threading.Thread(target=hub_simulado, daemon=True).start()

def pegar_painel():
    for _ in range(5):
        st, painel = adm.req('GET', f'/api/torneios/{cid}/painel', rotulo='painel')
        if st == 200: return painel
        print(f'  painel devolveu {st}, tentando de novo'); time.sleep(5)
    sys.exit('✗ painel não respondeu')

total_rodadas = None
r = 0
divergentes_total = 0
while True:
    r += 1
    etapa(f'3.{r} Rodada {r}')
    # Dois cliques ao mesmo tempo em "gerar rodada": tem que sair uma só
    corpo = {'numeroRodadas': args.rodadas} if (r == 1 and args.rodadas) else {}
    gerou = em_paralelo(lambda _: adm.req('POST', f'/api/torneios/{cid}/rodadas', corpo, 'gerar rodada')[0], range(2), workers=2)
    print('gerar rodada x2 simultâneo:', sorted(gerou), '(esperado: um 200 e um 409)')
    painel = pegar_painel()
    total_rodadas = painel['numeroRodadas']
    if painel['rodadaAtual'] != r:
        sys.exit(f'✗ dois cliques geraram rodada errada: esperado {r}, está na {painel["rodadaAtual"]}')
    aviso.set()

    mesas = [m for m in painel['mesas'] if m['b']]
    def jogar_mesa(m):
        time.sleep(random.uniform(0, args.ritmo))   # a mesa termina em algum momento da rodada
        a, b = por_user.get(m['a']['userId']), por_user.get(m['b']['userId'])
        if not a or not b: return 'sem jogador'
        if random.random() < args.divergencia:
            ra, rb = 'Venci', 'Venci'           # os dois dizem que ganharam
        else:
            ra = random.choice(['Venci', 'Venci', 'Perdi', 'Empatei'])
            rb = {'Venci': 'Perdi', 'Perdi': 'Venci', 'Empatei': 'Empatei'}[ra]
        # os dois apertam ao mesmo tempo
        res = em_paralelo(lambda x: x[0]['cli'].req('POST', f'/api/torneios/{cid}/partidas/{m["partidaId"]}/resultado',
                                                    {'resultado': x[1]}, 'lançar resultado')[0], [(a, ra), (b, rb)], workers=2)
        aviso.set()
        return 'divergente' if ra == rb == 'Venci' else 'ok'
    resultado_mesas = Counter(em_paralelo(jogar_mesa, mesas, workers=max(16, len(mesas))))
    time.sleep(2)  # deixa a última recarga acontecer
    print('mesas:', dict(resultado_mesas))

    # Organizador resolve as divergentes
    painel = pegar_painel()
    abertas = [m for m in painel['mesas'] if not m['resultado']]
    divergentes_total += sum(1 for m in abertas if m['divergente'])
    for m in abertas:
        adm.req('PUT', f'/api/torneios/{cid}/partidas/{m["partidaId"]}', {'resultado': random.choice(['VitoriaA', 'VitoriaB'])}, 'resolver')
    print(f'{len(abertas)} mesa(s) resolvidas pelo organizador')
    if r >= total_rodadas: break

# ── 4. Encerrar e conferir ───────────────────────────────────────────────────
etapa('4. Encerrar e conferir integridade')
st, tabela = adm.req('POST', f'/api/torneios/{cid}/encerrar', rotulo='encerrar')
problemas = []
if st != 200: problemas.append(f'encerrar devolveu {st}: {tabela}')
else:
    pos = [l['posicao'] for l in tabela]
    if pos != list(range(1, len(tabela) + 1)): problemas.append('colocações não são 1..N sem buraco')
    jogos = sum(l['vitorias'] + l['empates'] + l['derrotas'] for l in tabela)
    pontos = sum(l['pontos'] for l in tabela)
    v, e = sum(l['vitorias'] for l in tabela), sum(l['empates'] for l in tabela)
    if pontos != 3 * v + e: problemas.append(f'pontos ({pontos}) ≠ 3×V + E ({3 * v + e})')
    if e % 2: problemas.append('número ímpar de empates (empate conta pros dois)')
    print(f'{len(tabela)} na tabela · {total_rodadas} rodadas · {jogos} resultados · {divergentes_total} divergências resolvidas')
    print('pódio:', ', '.join(f"{l['posicao']}º {l['nome']} ({l['pontos']})" for l in tabela[:3]))

st, ch = adm.req('GET', f'/api/championship/{cid}', rotulo='campeonato')
if ch.get('status') != 'Finalizado': problemas.append(f"campeonato ficou {ch.get('status')}")

# ── Relatório ────────────────────────────────────────────────────────────────
etapa('Relatório')
print(f'{"rota":28} {"req":>5} {"p50 ms":>8} {"p95 ms":>8} {"máx ms":>8}  status')
total_429 = 0
for rota in sorted(lat):
    xs = sorted(lat[rota])
    p95 = xs[min(len(xs) - 1, int(len(xs) * 0.95))]
    total_429 += status[rota].get(429, 0)
    print(f'{rota:28} {len(xs):>5} {statistics.median(xs):>8.0f} {p95:>8.0f} {xs[-1]:>8.0f}  {dict(status[rota])}')
erros = sum(n for c in status.values() for s, n in c.items() if s >= 500 or s == 0)
fim_hub.set()
xs = sorted(instantes); pico = 0; ini = 0
for fim, x in enumerate(xs):
    while x - xs[ini] > 60: ini += 1
    pico = max(pico, fim - ini + 1)
print(f'pico em 60 s (tudo do mesmo IP): {pico} requisições · limite global por IP: 300/min')
print(f'\ntotal de requisições: {sum(len(x) for x in lat.values())} · 429: {total_429} · erros 5xx/conexão: {erros}')

# Limpeza: campeonato de teste (apaga rodadas, partidas e inscrições em cascata) e o timer dele.
# As contas de teste ficam (não há exclusão de usuário pela API).
if not args.manter:
    st, timers = adm.req('GET', '/api/timers', rotulo='limpeza')
    for tm in (timers if st == 200 else []):
        if tm.get('championshipId') == cid:
            adm.req('DELETE', f"/api/timers/{tm['id']}", rotulo='limpeza')
    st, _ = adm.req('DELETE', f'/api/championship/{cid}', rotulo='limpeza')
    print(f'limpeza: campeonato de teste apagado ({st})')

if problemas:
    print('\n✗ PROBLEMAS:'); [print('  -', p) for p in problemas]; sys.exit(1)
print('\n✓ integridade ok')
