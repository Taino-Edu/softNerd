#!/usr/bin/env python3
# =============================================================================
# scripts/gerar-mapa.py — Gera o mapa do sistema em docs/mapa/
#
#   python scripts/gerar-mapa.py
#
# Lê o código (não depende de nada rodando) e escreve:
#   docs/mapa/ENDPOINTS.md  → cada rota da API: método, quem pode chamar, qual
#                              função do front chama e em que telas ela é usada
#   docs/mapa/FRONTEND.md   → páginas (URL → arquivo), componentes e onde são
#                              usados, e o que cada lib/ exporta
#   docs/mapa/BACKEND.md    → tabelas do banco, serviços, robôs em segundo plano
#
# Rode de novo sempre que criar/mudar endpoint, página, componente ou tabela.
# O "onde mexer pra…" (regras que valem pro sistema todo) fica à mão em
# docs/mapa/README.md — esse o script não toca.
# =============================================================================

import os
import re
from collections import defaultdict
from pathlib import Path

RAIZ     = Path(__file__).resolve().parent.parent
BACK     = RAIZ / 'CardGameStore'
FRONT    = RAIZ / 'frontend'
SAIDA    = RAIZ / 'docs' / 'mapa'
IGNORAR  = {'node_modules', '.next', 'bin', 'obj', 'Migrations'}

AVISO = '> Gerado por `python scripts/gerar-mapa.py` — não edite à mão, rode o script de novo.\n'


def arquivos(base: Path, exts):
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in IGNORAR]
        for f in filenames:
            if f.endswith(exts):
                yield Path(dirpath) / f


def _posix(p: Path) -> str:
    # Ordena pelo texto do caminho: Path no Windows compara sem maiúscula/minúscula e no
    # Linux (CI) com — a ordem do mapa mudava de máquina pra máquina.
    return p.as_posix()


def rel(p: Path) -> str:
    return p.relative_to(RAIZ).as_posix()


def ler(p: Path) -> str:
    return p.read_text(encoding='utf-8', errors='replace')


# ── Backend: endpoints ────────────────────────────────────────────────────────

ATTR_HTTP  = re.compile(r'\[Http(Get|Post|Put|Patch|Delete)(?:\("([^"]*)"[^)]*\))?\]')
ATTR_ROUTE = re.compile(r'\[Route\("([^"]*)"\)\]')
ATTR_AUTH  = re.compile(r'\[Authorize(?:\(([^)]*)\))?\]')
CLASSE     = re.compile(r'public\s+(?:sealed\s+)?class\s+(\w+)Controller\b')
METODO     = re.compile(r'public\s+(?:async\s+)?[\w<>\[\],\s?]+?\s+(\w+)\s*\(')


def nome_auth(m) -> str:
    """[Authorize] → logado; (Policy = "X") ou ("X") → X; (Roles = "A,B") → papéis A,B."""
    args = (m.group(1) or '').strip()
    if not args: return 'logado'
    pol = re.search(r'Policy\s*=\s*"([^"]+)"', args)
    if pol: return pol.group(1)
    roles = re.search(r'Roles\s*=\s*"([^"]+)"', args)
    if roles: return 'papéis ' + roles.group(1)
    solto = re.match(r'"([^"]+)"', args)
    return solto.group(1) if solto else 'logado'


def endpoints_backend():
    eps = []
    for arq in sorted((BACK / 'Controllers').glob('*.cs'), key=_posix):
        linhas = ler(arq).splitlines()
        prefixo, auth_classe, controller = '', '', None
        pendentes = []          # atributos acumulados antes da próxima declaração
        for i, linha in enumerate(linhas):
            l = linha.strip()
            if l.startswith('['):
                pendentes.append(l)
                continue
            m = CLASSE.search(l)
            if m and controller is None:
                controller = m.group(1)
                for a in pendentes:
                    r = ATTR_ROUTE.search(a)
                    if r: prefixo = r.group(1).replace('[controller]', controller.lower())
                    if a.startswith('[AllowAnonymous'): auth_classe = 'público'
                    au = ATTR_AUTH.search(a)
                    if au: auth_classe = nome_auth(au)
                pendentes = []
                continue
            m = METODO.search(l)
            if m and controller and any(ATTR_HTTP.search(a) for a in pendentes):
                auth = auth_classe or 'público'
                for a in pendentes:
                    if a.startswith('[AllowAnonymous'): auth = 'público'
                    au = ATTR_AUTH.search(a)
                    if au: auth = nome_auth(au)
                for a in pendentes:
                    h = ATTR_HTTP.search(a)
                    if not h: continue
                    tmpl = h.group(2) or ''
                    if tmpl.startswith('/') or tmpl.startswith('~/'):
                        rota = '/' + tmpl.lstrip('~/')
                    else:
                        rota = '/' + '/'.join(x for x in (prefixo.strip('/'), tmpl.strip('/')) if x)
                    eps.append({
                        'controller': controller, 'arquivo': rel(arq), 'linha': i + 1,
                        'verbo': h.group(1).upper(), 'rota': rota, 'metodo': m.group(1), 'auth': auth,
                    })
            if l and not l.startswith('//') and not l.startswith('['):
                pendentes = []
    return eps


# ── Frontend: quem chama cada rota ────────────────────────────────────────────

def rota_para_regex(rota: str):
    partes = []
    for seg in rota.strip('/').split('/'):
        if seg.startswith('{') and ':guid' in seg:
            # {id:guid} só casa com ${...} ou um guid de verdade — não com palavra fixa (/perfis/permissoes)
            partes.append(r'(?:\$\{[^}]+\}|[0-9a-fA-F-]{36})')
        elif seg.startswith('{'):
            partes.append(r'(?:\$\{[^}]+\}|[^/\'"`?]+)')
        else:
            partes.append(re.escape(seg))
    return re.compile('/' + '/'.join(partes) + r'(?=[\'"`?]|$)', re.IGNORECASE)


def funcoes_api_ts():
    """lib/api/*.ts: em que objeto/função fica cada linha (ex.: crediarioApi.avisoConfig)."""
    pasta = FRONT / 'lib' / 'api'
    out = []
    for arq in sorted(pasta.glob('*.ts'), key=_posix) if pasta.exists() else []:
        linhas = ler(arq).splitlines()
        objeto, chave, mapa = None, None, []
        for l in linhas:
            mo = re.match(r'export const (\w+)\s*=\s*\{', l)
            if mo: objeto, chave = mo.group(1), None
            elif re.match(r'^\}', l): objeto = None
            mk = re.match(r'\s{2}(\w+)\s*:\s*(?:async\s*)?\(', l)
            if objeto and mk: chave = mk.group(1)
            mapa.append(f'{objeto}.{chave}' if objeto and chave else None)
        out.append((rel(arq), linhas, mapa))
    return out


def usos_front(eps):
    fontes = {rel(p): ler(p) for p in arquivos(FRONT, ('.ts', '.tsx'))}
    api_arqs = funcoes_api_ts()
    api_rels = {a[0] for a in api_arqs}

    for ep in eps:
        rx = rota_para_regex(ep['rota'])
        funcoes, arquivos_diretos = set(), set()
        for _, api_linhas, api_mapa in api_arqs:
            for i, l in enumerate(api_linhas):
                if rx.search(l) and api_mapa[i]:
                    # Mesma rota com métodos diferentes (GET lista, POST cria): confere o verbo da chamada
                    verbo = re.search(r'(?:api|axios)\.(get|post|put|patch|delete)', l)
                    if verbo and verbo.group(1).upper() != ep['verbo']:
                        continue
                    funcoes.add(api_mapa[i])
        for caminho, txt in fontes.items():
            if caminho not in api_rels and rx.search(txt):
                arquivos_diretos.add(caminho)
        telas = set()
        for f in funcoes:
            uso = re.compile(re.escape(f) + r'\b')
            for caminho, txt in fontes.items():
                if caminho not in api_rels and uso.search(txt):
                    telas.add(caminho)
        ep['funcoes'] = sorted(funcoes)
        ep['telas'] = sorted(telas | arquivos_diretos)


# ── Frontend: páginas, componentes, libs ──────────────────────────────────────

def paginas_front():
    app = FRONT / 'app'
    out = []
    for p in sorted(app.rglob('page.tsx'), key=_posix):
        partes = [x for x in p.parent.relative_to(app).parts if not (x.startswith('(') and x.endswith(')'))]
        url = '/' + '/'.join(partes)
        txt = ler(p)
        comps = sorted(set(re.findall(r"from '@/components/([\w/\-]+)'", txt)))
        out.append((url, rel(p), comps))
    return out


def componentes_front():
    base = FRONT / 'components'
    fontes = {rel(p): ler(p) for p in arquivos(FRONT, ('.ts', '.tsx'))}
    out = []
    for p in sorted(base.rglob('*.tsx'), key=_posix):
        nome = p.relative_to(base).with_suffix('').as_posix()
        rx = re.compile(r"""from\s+['"]@/components/""" + re.escape(nome) + r"""['"]""")
        usado = sorted(c for c, t in fontes.items() if rx.search(t) and c != rel(p))
        txt = ler(p)
        exporta = re.findall(r'export\s+(?:default\s+)?function\s+(\w+)', txt)
        out.append((nome, rel(p), exporta, usado))
    return out


def libs_front():
    out = []
    for p in sorted((FRONT / 'lib').rglob('*.ts'), key=_posix):
        txt = ler(p)
        exps = re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(\w+)', txt)
        out.append((rel(p), exps))
    return out


# ── Backend: tabelas, serviços, robôs ─────────────────────────────────────────

def tabelas_backend():
    # SQL de inicialização: Data/Inicializacao/*.sql + colunas do SQLite em InicializacaoBanco.cs
    program = '\n'.join(ler(p) for p in sorted((BACK / 'Data' / 'Inicializacao').glob('*.sql'), key=_posix))
    program += '\n' + ler(BACK / 'Data' / 'InicializacaoBanco.cs')
    ctx     = ler(BACK / 'Data' / 'AppDbContext.cs')
    out = []
    for p in sorted((BACK / 'Models').rglob('*.cs'), key=_posix):
        txt = ler(p)
        for m in re.finditer(r'\[Table\("(\w+)"\)\]\s*public\s+class\s+(\w+)', txt):
            tabela, classe = m.group(1), m.group(2)
            dbset = re.search(r'DbSet<' + classe + r'>\s+(\w+)', ctx)
            ddl = []
            if re.search(r'CREATE TABLE IF NOT EXISTS\s+' + tabela + r'\b', program): ddl.append('criada')
            if re.search(r'ALTER TABLE\s+' + tabela + r'\b', program): ddl.append('colunas')
            out.append((tabela, classe, rel(p), dbset.group(1) if dbset else '—', ', '.join(ddl) or '—'))
    # MongoDB
    mongo = []
    for p in sorted((BACK / 'Models' / 'MongoDB').glob('*.cs'), key=_posix) if (BACK / 'Models' / 'MongoDB').exists() else []:
        for c in re.findall(r'public\s+class\s+(\w+)', ler(p)):
            mongo.append((c, rel(p)))
    return out, mongo


def servicos_backend():
    program = ler(BACK / 'Program.cs') + ler(BACK / 'Configuration' / 'ServicosDaLoja.cs')
    registros = re.findall(r'(?:builder\.Services|services)\.Add(Scoped|Singleton|Transient|HostedService)<([\w., ]+)>\(\)', program)
    # Implementations/ + subpastas por assunto (ex.: Services/Liga/)
    arquivos_impl = {p.stem: rel(p) for p in (BACK / 'Services').rglob('*.cs') if 'Interfaces' not in p.parts}
    servicos, robos = [], []
    for tipo, alvo in registros:
        nomes = [x.strip() for x in alvo.split(',')]
        impl = nomes[-1].split('.')[-1]
        caminho = arquivos_impl.get(impl, '—')
        if caminho == '—':
            for stem, c in arquivos_impl.items():
                if re.search(r'class\s+' + impl + r'\b', ler(RAIZ / c)): caminho = c
        linha = (tipo, ' → '.join(nomes), caminho)
        (robos if tipo == 'HostedService' else servicos).append(linha)
    for r in robos:
        pass
    return servicos, robos


def resumo_robo(caminho: str) -> str:
    if caminho == '—': return ''
    txt = ler(RAIZ / caminho)
    m = re.search(r'//\s*\w+\.cs\s*—\s*(.+)', txt)
    return m.group(1).strip() if m else ''


# ── Escrita ───────────────────────────────────────────────────────────────────

def escrever_endpoints(eps):
    por_ctrl = defaultdict(list)
    for e in eps: por_ctrl[e['controller']].append(e)
    linhas = ['# Mapa — Endpoints da API', '', AVISO,
              f'{len(eps)} endpoints em {len(por_ctrl)} controllers. "Quem" = política de acesso '
              '(`AdminOnly` = admin/operador, `OwnerOnly` = só o dono, `logado` = qualquer usuário logado).', '',
              '"Função no front" é a chamada em `frontend/lib/api/` (um arquivo por assunto); "Telas" são os arquivos que usam essa função '
              '(ou chamam a rota direto). Endpoint sem tela = só usado por robô, webhook, integração ou ninguém.', '']
    linhas.append('## Índice')
    linhas += [f'- [{c}](#{c.lower()}) ({len(v)})' for c, v in sorted(por_ctrl.items())]
    for c, lista in sorted(por_ctrl.items()):
        linhas += ['', f'## {c}', '', f'`{lista[0]["arquivo"]}`', '',
                   '| Método | Rota | Quem | Ação (linha) | Função no front | Telas |',
                   '|---|---|---|---|---|---|']
        for e in sorted(lista, key=lambda x: (x['rota'], x['verbo'])):
            telas = '<br>'.join(f'`{t.replace("frontend/", "")}`' for t in e['telas']) or '—'
            funcs = '<br>'.join(f'`{f}`' for f in e['funcoes']) or '—'
            linhas.append(f"| {e['verbo']} | `{e['rota']}` | {e['auth']} | `{e['metodo']}` ({e['linha']}) | {funcs} | {telas} |")
    (SAIDA / 'ENDPOINTS.md').write_text('\n'.join(linhas) + '\n', encoding='utf-8')


def escrever_frontend(paginas, comps, libs):
    linhas = ['# Mapa — Frontend', '', AVISO,
              '## Páginas (URL → arquivo)', '', '| URL | Arquivo | Componentes usados |', '|---|---|---|']
    for url, arq, cs in paginas:
        linhas.append(f"| `{url}` | `{arq.replace('frontend/', '')}` | {', '.join(f'`{c}`' for c in cs) or '—'} |")
    linhas += ['', '## Componentes (onde cada um é usado)', '',
               'Mudou um componente? Confira as telas da última coluna.', '',
               '| Componente | Exporta | Usado em |', '|---|---|---|']
    for nome, arq, exps, usado in comps:
        linhas.append(f"| `{nome}` | {', '.join(f'`{e}`' for e in exps) or '—'} | "
                      f"{'<br>'.join(f'`{u.replace(chr(102)+'rontend/', '')}`' for u in usado) or '**nenhum lugar**'} |")
    linhas += ['', '## Bibliotecas (`frontend/lib`)', '', '| Arquivo | Exporta |', '|---|---|']
    for arq, exps in libs:
        mostra = ', '.join(f'`{e}`' for e in exps[:25]) + (f' … (+{len(exps) - 25})' if len(exps) > 25 else '')
        linhas.append(f"| `{arq.replace('frontend/', '')}` | {mostra or '—'} |")
    (SAIDA / 'FRONTEND.md').write_text('\n'.join(linhas) + '\n', encoding='utf-8')


def escrever_backend(tabelas, mongo, servicos, robos):
    linhas = ['# Mapa — Backend', '', AVISO,
              '## Tabelas do PostgreSQL', '',
              'O banco usa `EnsureCreated` (sem migrations). Tabela/coluna nova em banco que já existe '
              'precisa de SQL em `CardGameStore/Data/Inicializacao/` (postgres.sql e sqlite.sql) — a coluna "No startup" '
              'mostra quais já têm (`criada` = CREATE TABLE IF NOT EXISTS, `colunas` = ALTER TABLE).', '',
              '| Tabela | Classe | DbSet | No startup | Arquivo |', '|---|---|---|---|---|']
    for t, c, arq, dbset, ddl in sorted(tabelas):
        linhas.append(f'| `{t}` | `{c}` | `{dbset}` | {ddl} | `{arq}` |')
    if mongo:
        linhas += ['', '## MongoDB', '', '| Classe | Arquivo |', '|---|---|']
        linhas += [f'| `{c}` | `{a}` |' for c, a in mongo]
    linhas += ['', '## Robôs em segundo plano (rodam sozinhos)', '', '| Classe | O que faz | Arquivo |', '|---|---|---|']
    for _, nomes, caminho in robos:
        linhas.append(f'| `{nomes}` | {resumo_robo(caminho) or "—"} | `{caminho}` |')
    linhas += ['', '## Serviços registrados (injeção de dependência)', '', '| Tipo | Serviço | Arquivo |', '|---|---|---|']
    for tipo, nomes, caminho in servicos:
        linhas.append(f'| {tipo} | `{nomes}` | `{caminho}` |')
    (SAIDA / 'BACKEND.md').write_text('\n'.join(linhas) + '\n', encoding='utf-8')


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    eps = endpoints_backend()
    usos_front(eps)
    escrever_endpoints(eps)
    paginas, comps, libs = paginas_front(), componentes_front(), libs_front()
    escrever_frontend(paginas, comps, libs)
    tabelas, mongo = tabelas_backend()
    servicos, robos = servicos_backend()
    escrever_backend(tabelas, mongo, servicos, robos)
    sem_tela = sum(1 for e in eps if not e['telas'])
    print(f'endpoints: {len(eps)} ({sem_tela} sem tela no front) | páginas: {len(paginas)} | '
          f'componentes: {len(comps)} | tabelas: {len(tabelas)} | robôs: {len(robos)} | serviços: {len(servicos)}')


if __name__ == '__main__':
    main()
