"""
ensaio-campeonato.py — ensaio geral LOCAL de um dia de campeonato (liguinha), passo a passo.

Complementa o carga-liguinha.py (que testa VOLUME): aqui é o ROTEIRO do evento, com o que dá
errado na vida real, e cada etapa confere a regra e marca ✓/✗:

  1. inscrição antecipada pelo site (8 jogadores, cada um com um deck do formato atual)
  2. dia do evento: a loja prepara o torneio com MENOS mesas que jogadores (lugares)
     - 6 fazem "Estou aqui" (check-in com um toque), 2 chegam na hora e entram pelo código,
       1 inscrito é marcado presente pela loja, 1 inscrito NÃO aparece
  3. rodadas do suíço (melhor de 1):
     - "Soltar pareamentos" NÃO liga o relógio; "Começar rodada" liga
     - quem não fez check-in não é pareado; número ímpar → bye pro último da tabela
     - mesas além dos lugares da loja ficam "aguardando mesa"
     - ninguém joga duas vezes contra o mesmo adversário
     - rodada 2: os dois jogadores de uma mesa dizem "Venci" → a loja resolve
     - rodada 3: um jogador desiste → não é mais pareado
  4. encerra: colocações 1..N, pontos = 3×V + E, ordem por pontos e desempate (OWP),
     campeonato Finalizado, pódio, telão público e a Liga Mensal somando 10/7/5/3/1

Só roda contra localhost: cria contas e um campeonato de teste. Por padrão MANTÉM o campeonato
(pra olhar o telão, a tela do jogador e a página da liga depois); --limpar apaga no fim.

Uso:   python scripts/ensaio-campeonato.py [--api http://localhost:5000] [--limpar]
Admin: ADMIN_EMAIL / ADMIN_PASSWORD no ambiente (padrão: o seed de desenvolvimento).
"""
import argparse, http.cookiejar, json, os, random, secrets, sys, time
import urllib.error, urllib.parse, urllib.request
from collections import Counter
from datetime import datetime, timezone, timedelta

ap = argparse.ArgumentParser()
ap.add_argument('--api', default='http://localhost:5000')
ap.add_argument('--limpar', action='store_true', help='apaga o campeonato de teste no fim')
ap.add_argument('--semente', type=int, default=None, help='resultados reproduzíveis')
args = ap.parse_args()

if urllib.parse.urlparse(args.api).hostname not in ('localhost', '127.0.0.1', '::1'):
    sys.exit('Só roda contra localhost (cria contas e campeonato de teste).')
if args.semente is not None:
    random.seed(args.semente)

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@cardgamestore.com.br')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'SenhaForte@123')  # seed de dev (Data/InicializacaoBanco.cs)

falhas: list[str] = []


def ok(cond: bool, msg: str):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        falhas.append(msg)
    return cond


def etapa(titulo):
    print(f'\n── {titulo} ' + '─' * max(0, 66 - len(titulo)))


class Cliente:
    def __init__(self, nome):
        self.nome = nome
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def req(self, metodo, rota, corpo=None):
        r = urllib.request.Request(args.api + rota, method=metodo,
                                   data=json.dumps(corpo).encode() if corpo is not None else None,
                                   headers={'Content-Type': 'application/json'})
        try:
            with self.op.open(r, timeout=30) as resp:
                txt, st = resp.read().decode(), resp.status
        except urllib.error.HTTPError as e:
            txt, st = e.read().decode(), e.code
        try:
            return st, (json.loads(txt) if txt else None)
        except ValueError:
            return st, txt


# ── 1. Inscrição antecipada ──────────────────────────────────────────────────
etapa('1. Inscrição antecipada pelo site')
adm = Cliente('loja')
st, _ = adm.req('POST', '/api/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
if st != 200:
    sys.exit(f'Login da loja falhou ({st}). A API local está no ar?')

marca = datetime.now().strftime('%H%M%S')
agora = datetime.now(timezone.utc)
st, ch = adm.req('POST', '/api/championship', {
    'name': f'Ensaio Liguinha {marca}', 'game': 'Pokemon', 'description': 'Ensaio geral (teste local)',
    'startDate': agora.strftime('%Y-%m-%dT%H:%M:%SZ'), 'entryFeeInCents': 0, 'maxParticipants': 24})
if st >= 300:
    sys.exit(f'Não criou o campeonato: {st} {ch}')
cid = ch['id']
adm.req('PUT', f'/api/championship/{cid}/status', {'status': 'Inscricoes'})
print(f'  campeonato {cid}')

DECKS = ['Dragapult ex', 'Charizard ex / Pidgeot ex', 'Gardevoir ex', 'Mega Lucario ex', 'Raging Bolt ex',
         'Gholdengo ex', 'Mewtwo ex da Equipe Rocket', 'Lost Box', 'Mega Absol ex', 'Terapagos ex']
NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo', 'Iara', 'João']
senha = secrets.token_urlsafe(12) + 'Aa1!'   # gerada aqui, nunca impressa
jogadores = []
for i, (nome, deck) in enumerate(zip(NOMES, DECKS), start=1):
    email = f'ensaio{marca}-{i}@teste.local'
    st, u = adm.req('POST', '/api/user', {'name': f'{nome} Ensaio', 'email': email, 'password': senha, 'role': 'Customer'})
    if st >= 300:
        sys.exit(f'Não criou a conta de {nome}: {st} {u}')
    j = {'nome': f'{nome} Ensaio', 'email': email, 'userId': u['id'], 'deck': deck, 'cli': Cliente(nome)}
    st, _ = j['cli'].req('POST', '/api/auth/login', {'email': email, 'password': senha})
    if st != 200:
        sys.exit(f'{nome} não conseguiu entrar ({st})')
    jogadores.append(j)

inscritos, avulsos = jogadores[:8], jogadores[8:]          # 8 pelo site; 2 chegam na hora
for j in inscritos:
    st, r = j['cli'].req('POST', f'/api/championship/{cid}/register', {'deckName': j['deck']})
    j['inscricaoSite'] = st
ok(all(j['inscricaoSite'] < 300 for j in inscritos), '8 jogadores se inscreveram pelo site com o deck')
st, publico = Cliente('visitante').req('GET', '/api/championship')
mostra = next((c for c in (publico or []) if c['id'] == cid), None)
ok(mostra is not None, 'o campeonato aparece na lista pública (página inicial / área do cliente)')

# ── 2. Dia do evento: preparar e check-in ───────────────────────────────────
etapa('2. Dia do evento: preparar o torneio e check-in')
LUGARES = 6   # 3 mesas na loja; com 9 presentes sai uma mesa "aguardando mesa"
st, prep = adm.req('POST', f'/api/torneios/{cid}/preparar', {'melhorDe': 1, 'minutosRodada': 50, 'lugares': LUGARES})
ok(st == 200 and bool(prep.get('codigoEntrada')), f'loja preparou (melhor de 1, 50 min, {LUGARES} lugares) e recebeu o código')
codigo = prep.get('codigoEntrada', '')

faltou = inscritos[6]          # inscrito que não aparece
marcado_pela_loja = inscritos[7]
for j in inscritos[:6]:
    st, _ = j['cli'].req('POST', f'/api/torneios/{cid}/check-in')
    j['checkin'] = st
ok(all(j['checkin'] < 300 for j in inscritos[:6]), '6 inscritos fizeram "Estou aqui" (check-in com um toque)')

st, _ = avulsos[0]['cli'].req('POST', '/api/torneios/entrar', {'codigo': 'ZZZZZ', 'deckNome': avulsos[0]['deck']})
ok(st == 404, f'código errado é recusado sem quebrar nada ({st})')
for j in avulsos:
    st, _ = j['cli'].req('POST', '/api/torneios/entrar', {'codigo': codigo.lower(), 'deckNome': j['deck']})
    j['checkin'] = st
ok(all(j['checkin'] < 300 for j in avulsos), '2 jogadores que chegaram na hora entraram pelo código (digitado em minúsculas)')

st, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
por_user = {p['userId']: p for p in painel['participantes']}
st, _ = adm.req('PUT', f"/api/torneios/{cid}/participantes/{por_user[marcado_pela_loja['userId']]['id']}/check-in", {'presente': True})
ok(st < 300, 'a loja marcou presente um inscrito que não conseguiu pelo celular')

st, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
presentes = [p for p in painel['participantes'] if p.get('checkInEm')]
ok(len(painel['participantes']) == 10, f"painel lista os 10 participantes ({len(painel['participantes'])})")
ok(len(presentes) == 9, f'9 presentes, 1 faltou ({len(presentes)} presentes)')
ok(painel.get('rodadasSugeridas') in (3, 4), f"rodadas sugeridas pra 9 jogadores: {painel.get('rodadasSugeridas')}")
pid_por_user = {p['userId']: p['id'] for p in painel['participantes']}
nome_por_pid = {p['id']: p['nome'] for p in painel['participantes']}

# ── 3. Rodadas ───────────────────────────────────────────────────────────────
confrontos: set[frozenset] = set()
tiveram_bye: set[str] = set()
desistente = None
r = 0
total = None
while True:
    r += 1
    etapa(f'3.{r} Rodada {r}')
    corpo = {'numeroRodadas': 4} if r == 1 else {}
    st, antes = adm.req('GET', f'/api/torneios/{cid}/painel')    # tabela ANTES (o bye já conta 3 pts ao sair)
    pontos_antes = {l['participanteId']: l['pontos'] for l in antes.get('classificacao', [])}
    st, _ = adm.req('POST', f'/api/torneios/{cid}/rodadas', corpo)
    ok(st < 300, f'loja soltou os pareamentos da rodada {r}')
    st, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
    total = painel['numeroRodadas']
    timer = painel.get('timer')
    ok(not timer or timer.get('state') != 'running', 'relógio NÃO correu ao soltar os pareamentos (dá tempo do setup)')

    mesas = painel['mesas']
    jogando = [m['a']['participanteId'] for m in mesas] + [m['b']['participanteId'] for m in mesas if m['b']]
    ok(len(jogando) == len(set(jogando)), 'cada jogador aparece em uma mesa só')
    ok(pid_por_user[faltou['userId']] not in jogando, f"{faltou['nome']} (faltou) não foi pareado")
    if desistente:
        ok(pid_por_user[desistente['userId']] not in jogando, f"{desistente['nome']} (desistiu) não foi mais pareado")
    byes = [m for m in mesas if not m['b']]
    esperados = 9 - (1 if desistente else 0)
    ok(len(byes) == esperados % 2, f'{len(byes)} bye ({esperados} jogando)')
    if byes:
        # Regra (Suico.cs): bye pro PIOR colocado que ainda não teve bye (evitando revanche)
        quem_bye = byes[0]['a']['participanteId']
        ok(quem_bye not in tiveram_bye, f"{nome_por_pid[quem_bye]} recebeu bye pela primeira vez")
        if r > 1:
            elegiveis = [pid for pid in jogando if pid not in tiveram_bye]
            menor = min(pontos_antes.get(pid, 0) for pid in elegiveis)
            ok(pontos_antes.get(quem_bye, 0) == menor,
               f"bye foi pro pior colocado sem bye ainda ({nome_por_pid[quem_bye]}, {pontos_antes.get(quem_bye, 0)} pts antes da rodada)")
        tiveram_bye.add(quem_bye)
    aguardando = [m for m in mesas if m['b'] and m.get('aguardandoMesa')]
    ok(len(aguardando) == max(0, len([m for m in mesas if m['b']]) - LUGARES // 2),
       f'{len(aguardando)} mesa(s) aguardando lugar (a loja tem {LUGARES // 2} mesas)')
    repetidos = [m for m in mesas if m['b'] and frozenset((m['a']['participanteId'], m['b']['participanteId'])) in confrontos]
    ok(not repetidos, 'ninguém enfrenta o mesmo adversário de novo')
    for m in mesas:
        if m['b']:
            confrontos.add(frozenset((m['a']['participanteId'], m['b']['participanteId'])))

    st, _ = adm.req('POST', f'/api/torneios/{cid}/rodadas/atual/comecar')
    st2, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
    ok(st < 300 and (painel.get('timer') or {}).get('state') == 'running', '"Começar rodada" ligou o relógio')

    # Tela do jogador: mostra a mesa e o oponente
    exemplo = next(m for m in mesas if m['b'])
    jog = next(j for j in jogadores if j['userId'] == exemplo['a']['userId'])
    st, mm = jog['cli'].req('GET', f'/api/torneios/{cid}/minha-mesa')
    ok(st == 200 and mm.get('mesa') and mm['mesa']['b'] and mm['mesa']['b']['nome'] == exemplo['b']['nome'],
       f"tela do jogador mostra a mesa e o oponente certo ({jog['nome']} × {exemplo['b']['nome']})")

    # Resultados: os dois de cada mesa lançam
    divergente_mesa = None
    for idx, m in enumerate(m for m in mesas if m['b']):
        a = next(j for j in jogadores if j['userId'] == m['a']['userId'])
        b = next(j for j in jogadores if j['userId'] == m['b']['userId'])
        if r == 2 and idx == 0:
            ra, rb = 'Venci', 'Venci'                       # os dois dizem que ganharam
            divergente_mesa = m['partidaId']
        else:
            ra = random.choice(['Venci', 'Venci', 'Perdi', 'Perdi', 'Empatei'])
            rb = {'Venci': 'Perdi', 'Perdi': 'Venci', 'Empatei': 'Empatei'}[ra]
        sa, _ = a['cli'].req('POST', f"/api/torneios/{cid}/partidas/{m['partidaId']}/resultado", {'resultado': ra})
        sb, _ = b['cli'].req('POST', f"/api/torneios/{cid}/partidas/{m['partidaId']}/resultado", {'resultado': rb})
        if sa >= 300 or sb >= 300:
            ok(False, f"lançar resultado na mesa {m['mesa']} devolveu {sa}/{sb}")

    st, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
    abertas = [m for m in painel['mesas'] if m['b'] and not m['resultado']]
    if r == 2:
        div = [m for m in abertas if m['divergente']]
        ok(len(div) == 1 and div[0]['partidaId'] == divergente_mesa, 'a mesa em que os dois disseram "Venci" aparece como divergente pra loja')
        st, _ = adm.req('POST', f'/api/torneios/{cid}/rodadas')
        ok(st == 409, f'a loja não consegue soltar a próxima rodada com mesa em aberto ({st})')
        st, _ = adm.req('PUT', f'/api/torneios/{cid}/partidas/{divergente_mesa}', {'resultado': 'VitoriaA'})
        ok(st < 300, 'a loja resolveu a divergência')
        st, painel = adm.req('GET', f'/api/torneios/{cid}/painel')
        abertas = [m for m in painel['mesas'] if m['b'] and not m['resultado']]
    ok(not abertas, f'todas as mesas da rodada {r} fecharam')

    if r == 3:
        desistente = next(j for j in jogadores if j['userId'] == painel['classificacao'][-1]['userId'])
        st, _ = desistente['cli'].req('POST', f'/api/torneios/{cid}/desistir')
        ok(st < 300, f"{desistente['nome']} desistiu pelo celular depois da rodada 3")

    if r >= total:
        break

# ── 4. Encerramento e conferências ──────────────────────────────────────────
etapa('4. Encerrar e conferir')
st, tabela = adm.req('POST', f'/api/torneios/{cid}/encerrar')
ok(st == 200, 'a loja encerrou o torneio')
if st == 200:
    ok([l['posicao'] for l in tabela] == list(range(1, len(tabela) + 1)), f'colocações 1..{len(tabela)} sem buraco')
    ok(all(l['pontos'] == 3 * l['vitorias'] + l['empates'] for l in tabela), 'pontos de cada um = 3 × vitórias + empates')
    ok(sum(l['empates'] for l in tabela) % 2 == 0, 'empates batem (contam pros dois)')
    ordenada = all((tabela[i]['pontos'], tabela[i]['owp']) >= (tabela[i + 1]['pontos'], tabela[i + 1]['owp'])
                   for i in range(len(tabela) - 1))
    ok(ordenada, 'ordem por pontos e, no empate, pela % de vitória dos adversários (OWP)')
    nomes_tab = {l['userId'] for l in tabela}
    ok(faltou['userId'] not in nomes_tab, f"{faltou['nome']} (faltou) não entra na classificação")
    linha_desist = next((l for l in tabela if desistente and l['userId'] == desistente['userId']), None)
    ok(linha_desist is not None and linha_desist.get('desistiuNaRodada') is not None,
       'quem desistiu continua na tabela, marcado como desistente')
    print('\n  Classificação final:')
    for l in tabela:
        extra = ' (desistiu)' if l.get('desistiuNaRodada') else ''
        print(f"   {l['posicao']:>2}º {l['nome']:<16} {l['pontos']:>2} pts  {l['vitorias']}V {l['empates']}E {l['derrotas']}D"
              f"  OWP {float(l['owp']):.2f}  {l.get('deck') or ''}{extra}")

st, chf = adm.req('GET', f'/api/championship/{cid}')
ok(chf.get('status') == 'Finalizado', f"campeonato ficou {chf.get('status')}")
st, tel = Cliente('telão').req('GET', f'/api/torneios/{cid}')
ok(st == 200 and len(tel.get('classificacao', [])) == len(tabela or []), 'telão abre sem login e mostra a classificação final')

# Liga Mensal: pontos pela colocação (10/7/5/3/1), no mês do campeonato (calendário de Brasília).
# As contas são novas a cada ensaio (uma linha por jogador na liga), então o total tem que ser EXATO:
# a mais também é erro (ex.: dar 10 pra todo mundo).
mes_br = (agora - timedelta(hours=3))
st, liga = Cliente('liga').req('GET', f'/api/liga-mensal?ano={mes_br.year}&mes={mes_br.month}')
pontos_liga = {l['userId']: l for l in (liga or {}).get('ranking', [])}
esperado = {1: 10, 2: 7, 3: 5, 4: 3}
erros_liga = []
for l in tabela or []:
    lin = pontos_liga.get(l['userId'])
    quer = esperado.get(l['posicao'], 1)
    if lin is None or lin['totalPoints'] != quer or lin.get('eventsPlayed') != 1:
        erros_liga.append(f"{l['nome']}: esperado {quer} pts em 1 evento, veio {lin and lin['totalPoints']} em {lin and lin.get('eventsPlayed')}")
ok(not erros_liga, 'Liga Mensal deu exatamente 10/7/5/3/1 pela colocação' + ('' if not erros_liga else ': ' + '; '.join(erros_liga[:3])))
ok(faltou['userId'] not in pontos_liga, f"{faltou['nome']} (faltou) não ganhou ponto na liga")
com_deck = [l for l in (tabela or []) if pontos_liga.get(l['userId'], {}).get('decks')]
ok(len(com_deck) == len(tabela or []), 'o deck de cada jogador chegou na Liga Mensal (vira o sprite na página)')

# ── Resultado ───────────────────────────────────────────────────────────────
etapa('Resultado')
print(f'  telão:        http://localhost:3000/liga/torneio/{cid}')
print(f'  liga mensal:  http://localhost:3000/liga')
print(f'  painel:       http://localhost:3000/admin/campeonatos/{cid}/torneio')
if args.limpar:
    st, timers = adm.req('GET', '/api/timers')
    for tm in (timers if st == 200 else []):
        if tm.get('championshipId') == cid:
            adm.req('DELETE', f"/api/timers/{tm['id']}")
    st, _ = adm.req('DELETE', f'/api/championship/{cid}')
    print(f'  campeonato de teste apagado ({st}) — as contas de teste ficam (não há exclusão pela API)')
else:
    print('  campeonato de teste mantido (rode com --limpar pra apagar no fim)')

if falhas:
    print(f'\n✗ {len(falhas)} conferência(s) falharam:')
    for f in falhas:
        print('   -', f)
    sys.exit(1)
print('\n✓ ensaio completo: tudo conferido')
