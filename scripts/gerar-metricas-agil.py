#!/usr/bin/env python3
"""
Gera o pacote de Gerenciamento Ágil do PIM IV (etapa 9) a partir do HISTÓRICO REAL do projeto:
  - frontend/public/CHANGELOG.md  → versões lançadas, datas, pedidos do cliente, mudanças com volta
  - git log                       → commits por período
  - gh pr list                    → PRs, tipos, tamanho, tempo de ciclo (precisa do GitHub CLI logado)
  - docs/planejamento/BACKLOG.md  → itens do quadro Kanban

Escreve em docs/pim/agil/: README.md, product-backlog.md, sprints.md, kanban.md, retrospectivas.md, metricas.md,
metricas.json e img/*.svg (gráficos e quadro Kanban).

A reconstrução é RETROATIVA: o projeto não rodava cerimônias formais. As sprints são janelas fixas de 14 dias a partir
da primeira versão (01/03/2026); datas, versões, commits e PRs são reais, as metas são resumos do que foi entregue.

Uso: python3 scripts/gerar-metricas-agil.py            (PRS_JSON=arquivo.json evita chamar o gh)
"""
import datetime as dt, json, math, os, re, statistics, subprocess, sys
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "docs" / "pim" / "agil"
IMG = SAIDA / "img"
INICIO = dt.date(2026, 3, 1)       # v1.0.0
DIAS = 14
PRIM_COMMIT = dt.date(2026, 3, 27)
HOJE = dt.date(2026, 11, 7)        # fim da última sprint completa
ENTREGA_PIM = dt.date(2026, 11, 14)

AZUL, AZUL_ESC, AMARELO, FUNDO, TEXTO, SUAVE = "#1E4FD6", "#123A9E", "#FFE45E", "#EEF4FF", "#0C3D5A", "#5B7289"
VERDE, VERMELHO, LARANJA, CIANO = "#16A34A", "#DC2626", "#F59E0B", "#3EC2F2"


def fmt_h(h):
    """Horas em texto humano: abaixo de 1 h vira minutos."""
    if h is None:
        return "—"
    return f"{round(h * 60)} min" if h < 1 else f"{h:.1f} h".replace(".", ",")


def sprint_de(d):
    return (d - INICIO).days // DIAS + 1


def janela(n):
    a = INICIO + dt.timedelta(days=DIAS * (n - 1))
    return a, a + dt.timedelta(days=DIAS - 1)


# ── dados ─────────────────────────────────────────────────────────────────────────────────────
def versoes():
    cl = (RAIZ / "frontend/public/CHANGELOG.md").read_text(encoding="utf-8")
    out = []
    for b in re.split(r"^## \[", cl, flags=re.M)[1:]:
        m = re.match(r"(v[\d.]+)\] — (\d{4}-\d{2}-\d{2})", b)
        if not m:
            continue
        out.append({
            "versao": m.group(1), "data": dt.date.fromisoformat(m.group(2)),
            "cliente": "Maikon" in b,
            "volta": "Mudança com volta" in b,
            "seguranca": bool(re.search(r"^### .*Segurança", b, re.M)),
        })
    return sorted(out, key=lambda v: v["data"])


def commits():
    r = subprocess.run(["git", "log", "--format=%ad", "--date=short"], capture_output=True, text=True, cwd=RAIZ)
    return [dt.date.fromisoformat(l) for l in r.stdout.split()]


def prs():
    arq = os.environ.get("PRS_JSON")
    if arq:
        return json.load(open(arq))
    r = subprocess.run(["gh", "pr", "list", "--state", "all", "--limit", "800", "--json",
                        "number,title,createdAt,mergedAt,state,additions,deletions,changedFiles,author"],
                       capture_output=True, text=True, cwd=RAIZ)
    if r.returncode != 0:
        sys.exit(f"gh falhou: {r.stderr.strip()}")
    return json.loads(r.stdout)


def tipo_pr(p):
    if p["author"]["login"].startswith("app/dependabot") or p["author"]["login"] == "dependabot[bot]":
        return "dependabot"
    m = re.match(r"(feat|fix|chore|docs|refactor|ci|perf|test|build)\b", p["title"])
    return m.group(1) if m else "outro"


# ── gráficos SVG (sem dependências) ───────────────────────────────────────────────────────────
def _esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;")


def _moldura(titulo, sub, w, h):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="Arial, Helvetica, sans-serif">',
            f'<rect width="{w}" height="{h}" fill="#fff"/>',
            f'<text x="24" y="32" font-size="19" font-weight="700" fill="{TEXTO}">{_esc(titulo)}</text>',
            f'<text x="24" y="52" font-size="12.5" fill="{SUAVE}">{_esc(sub)}</text>']


def barras(arq, titulo, sub, rotulos, series, cores, legendas=None, empilhado=False, w=960, h=380):
    """series: lista de listas de valores (uma por série). Agrupado ou empilhado."""
    e, d, t, b = 56, 24, 76, 52
    cw, ch = w - e - d, h - t - b
    n = len(rotulos)
    if empilhado:
        tot = [sum(s[i] for s in series) for i in range(n)]
        mx = max(tot) or 1
    else:
        mx = max(max(s) for s in series) or 1
    passo = 1 if mx <= 8 else (2 if mx <= 16 else (5 if mx <= 40 else (10 if mx <= 80 else 50)))
    topo = (math.floor(mx / passo) + 1) * passo
    s = _moldura(titulo, sub, w, h)
    for v in range(0, topo + 1, passo):
        y = t + ch - ch * v / topo
        s.append(f'<line x1="{e}" y1="{y:.1f}" x2="{w - d}" y2="{y:.1f}" stroke="#E3EAF7"/>')
        s.append(f'<text x="{e - 8}" y="{y + 4:.1f}" font-size="11" text-anchor="end" fill="{SUAVE}">{v}</text>')
    larg = cw / n
    k = len(series)
    for i, rot in enumerate(rotulos):
        x0 = e + i * larg
        if empilhado:
            base = 0
            for j, ser in enumerate(series):
                v = ser[i]
                if v:
                    alt = ch * v / topo
                    s.append(f'<rect x="{x0 + larg * .18:.1f}" y="{t + ch - ch * (base + v) / topo:.1f}" width="{larg * .64:.1f}" height="{alt:.1f}" fill="{cores[j]}"/>')
                base += v
            if tot[i]:
                s.append(f'<text x="{x0 + larg / 2:.1f}" y="{t + ch - ch * tot[i] / topo - 5:.1f}" font-size="11" font-weight="700" text-anchor="middle" fill="{TEXTO}">{tot[i]}</text>')
        else:
            bw = larg * .7 / k
            for j, ser in enumerate(series):
                v = ser[i]
                alt = ch * v / topo
                x = x0 + larg * .15 + j * bw
                s.append(f'<rect x="{x:.1f}" y="{t + ch - alt:.1f}" width="{bw - 1:.1f}" height="{max(alt, 0):.1f}" fill="{cores[j]}" rx="2"/>')
                if v:
                    s.append(f'<text x="{x + bw / 2:.1f}" y="{t + ch - alt - 4:.1f}" font-size="10.5" font-weight="700" text-anchor="middle" fill="{TEXTO}">{v}</text>')
        s.append(f'<text x="{x0 + larg / 2:.1f}" y="{t + ch + 18}" font-size="11.5" text-anchor="middle" fill="{TEXTO}">{_esc(rot)}</text>')
    s.append(f'<line x1="{e}" y1="{t + ch}" x2="{w - d}" y2="{t + ch}" stroke="#9DB0D0"/>')
    if legendas:
        x = e
        for j, lg in enumerate(legendas):
            s.append(f'<rect x="{x}" y="{h - 26}" width="12" height="12" fill="{cores[j]}" rx="2"/>')
            s.append(f'<text x="{x + 18}" y="{h - 16}" font-size="12" fill="{TEXTO}">{_esc(lg)}</text>')
            x += 28 + 7.2 * len(lg)
    s.append("</svg>")
    (IMG / arq).write_text("\n".join(s), encoding="utf-8")


def linha(arq, titulo, sub, rotulos, valores, w=960, h=360):
    e, d, t, b = 56, 30, 76, 52
    cw, ch = w - e - d, h - t - b
    mx = max(valores) or 1
    passo = 20 if mx > 80 else 10
    topo = (math.floor(mx / passo) + 1) * passo
    s = _moldura(titulo, sub, w, h)
    for v in range(0, topo + 1, passo):
        y = t + ch - ch * v / topo
        s.append(f'<line x1="{e}" y1="{y:.1f}" x2="{w - d}" y2="{y:.1f}" stroke="#E3EAF7"/>')
        s.append(f'<text x="{e - 8}" y="{y + 4:.1f}" font-size="11" text-anchor="end" fill="{SUAVE}">{v}</text>')
    n = len(rotulos)
    pts = [(e + cw * i / (n - 1), t + ch - ch * v / topo) for i, v in enumerate(valores)]
    area = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    s.append(f'<polygon points="{e},{t + ch} {area} {pts[-1][0]:.1f},{t + ch}" fill="{AZUL}" opacity=".10"/>')
    s.append(f'<polyline points="{area}" fill="none" stroke="{AZUL}" stroke-width="3" stroke-linejoin="round"/>')
    for (x, y), v, r in zip(pts, valores, rotulos):
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#fff" stroke="{AZUL}" stroke-width="2.5"/>')
        s.append(f'<text x="{x:.1f}" y="{t + ch + 18}" font-size="11.5" text-anchor="middle" fill="{TEXTO}">{_esc(r)}</text>')
    s.append(f'<text x="{pts[-1][0] - 6:.1f}" y="{pts[-1][1] - 12:.1f}" font-size="13" font-weight="700" text-anchor="end" fill="{AZUL_ESC}">{valores[-1]}</text>')
    s.append(f'<line x1="{e}" y1="{t + ch}" x2="{w - d}" y2="{t + ch}" stroke="#9DB0D0"/>')
    s.append("</svg>")
    (IMG / arq).write_text("\n".join(s), encoding="utf-8")


def quebra(texto, limite):
    linhas, atual = [], ""
    for p in texto.split():
        if len(atual) + len(p) + 1 > limite and atual:
            linhas.append(atual)
            atual = p
        else:
            atual = (atual + " " + p).strip()
    if atual:
        linhas.append(atual)
    return linhas[:3]


def kanban_svg(colunas):
    """colunas: [(titulo, cor, [cartoes])]"""
    cw, gap, topo = 250, 14, 70
    w = 24 + len(colunas) * (cw + gap)
    alt_cartao = 74
    h = topo + 20 + max(len(c[2]) for c in colunas) * (alt_cartao + 10) + 20
    s = _moldura("Quadro Kanban do Santuário Nerd", f"Foto de {HOJE:%d/%m/%Y} montada do BACKLOG, dos PRs abertos e do CHANGELOG", w, h)
    for i, (tit, cor, cartoes) in enumerate(colunas):
        x = 24 + i * (cw + gap)
        s.append(f'<rect x="{x}" y="{topo - 12}" width="{cw}" height="{h - topo - 4}" rx="12" fill="{FUNDO}"/>')
        s.append(f'<rect x="{x}" y="{topo - 12}" width="{cw}" height="30" rx="12" fill="{cor}"/>')
        s.append(f'<text x="{x + 14}" y="{topo + 8}" font-size="13.5" font-weight="700" fill="#fff">{_esc(tit)} ({len(cartoes)})</text>')
        for j, (cabeca, corpo) in enumerate(cartoes):
            y = topo + 30 + j * (alt_cartao + 10)
            s.append(f'<rect x="{x + 8}" y="{y}" width="{cw - 16}" height="{alt_cartao}" rx="9" fill="#fff" stroke="#D5E0F5"/>')
            s.append(f'<rect x="{x + 8}" y="{y}" width="5" height="{alt_cartao}" rx="2" fill="{cor}"/>')
            s.append(f'<text x="{x + 22}" y="{y + 18}" font-size="10.5" font-weight="700" fill="{cor}">{_esc(cabeca)}</text>')
            for k, ln in enumerate(quebra(corpo, 33)):
                s.append(f'<text x="{x + 22}" y="{y + 36 + k * 14}" font-size="11.5" fill="{TEXTO}">{_esc(ln)}</text>')
    s.append("</svg>")
    (IMG / "kanban.svg").write_text("\n".join(s), encoding="utf-8")


# ── textos reconstruídos (metas são resumos do que foi entregue) ──────────────────────────────
METAS = {
    1: "Lançamento inicial do sistema de gestão (v1.0.0).",
    2: "Catálogo de cartas TCG com busca integrada a API externa.",
    3: "Sem versão publicada (consolidação).",
    4: "Frente de Caixa (venda avulsa) com várias formas de pagamento.",
    5: "Sem versão publicada (consolidação).",
    6: "Relatório de estoque em PDF e pré-inscrição de campeonatos pela landing page.",
    7: "Sem versão publicada (consolidação).",
    8: "Perfis de acesso da equipe, histórico do cliente e página \"Sobre o sistema\" com versionamento.",
    9: "Preferências por perfil, atalhos de teclado, filtros de cartas, chave oficial do Pokémon TCG e **pré-vendas/reservas**.",
    10: "**Pix** na comanda e na inscrição de campeonato, mensageria, desconto em R$, personalização do site e módulo fiscal (removido depois).",
    11: "Domínio próprio **santuarionerd.com.br** e correções do financeiro e da nota fiscal.",
    12: "Pré-venda manual com vários itens, **estorno** de venda e comanda, parcelamento e desconto Pix na página do produto.",
    13: "Correções da área do cliente e forma de pagamento no histórico de compras.",
    14: "Vaga segurada na inscrição, conferência de decks e proteção da venda em andamento no caixa.",
    15: "Prazo de pagamento da inscrição editável na tela.",
    16: "**Crediário completo** (itens por compra, aviso de vencimento, link Pix, pagamento parcial), 1ª fase da **Liguinha** e as **\"mudanças com volta\"**.",
    17: "**Liguinha completa** (telão, Central, \"estou pronto\"), redesenho da loja e do painel, **Vigia do sistema**, Pokémon preferido e API no **.NET 10**.",
    18: "**Limpeza e arquitetura** (NFC-e e WhatsApp fora, Clean Architecture), correções pedidas pelo cliente, SEO, segurança e o **app Android da Liga**.",
}


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    vs, cs, ps = versoes(), commits(), prs()
    ultima = sprint_de(HOJE)
    ns = list(range(1, ultima + 1))
    rot = [f"S{n}" for n in ns]

    v_por = Counter(sprint_de(v["data"]) for v in vs)
    c_por = Counter(sprint_de(d) for d in cs if d >= PRIM_COMMIT)
    cli_por = Counter(sprint_de(v["data"]) for v in vs if v["cliente"])
    volta_por = Counter(sprint_de(v["data"]) for v in vs if v["volta"])
    seg_por = Counter(sprint_de(v["data"]) for v in vs if v["seguranca"])

    dev_prs = [p for p in ps if tipo_pr(p) != "dependabot"]
    merg = [p for p in dev_prs if p["mergedAt"]]
    pm_por = Counter(sprint_de(dt.date.fromisoformat(p["mergedAt"][:10])) for p in merg)
    tipos = ["feat", "fix", "refactor", "chore", "docs", "ci", "outro"]
    tp = {t: Counter() for t in tipos}
    ciclo = defaultdict(list)
    linhas_ad, linhas_rm = Counter(), Counter()
    for p in merg:
        n = sprint_de(dt.date.fromisoformat(p["mergedAt"][:10]))
        t = tipo_pr(p)
        tp[t if t in tp else "outro"][n] += 1
        h = (dt.datetime.fromisoformat(p["mergedAt"].replace("Z", "+00:00")) - dt.datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))).total_seconds() / 3600
        ciclo[n].append(h)
        linhas_ad[n] += p.get("additions", 0)
        linhas_rm[n] += p.get("deletions", 0)
    dep_merg = sum(1 for p in ps if tipo_pr(p) == "dependabot" and p["mergedAt"])

    # acumulado de versões
    acum, soma = [], 0
    for n in ns:
        soma += v_por.get(n, 0)
        acum.append(soma)

    # gráficos
    barras("versoes-por-sprint.svg", "Versões lançadas por sprint", "Fonte: CHANGELOG.md. Cada versão é uma entrega ao cliente.", rot,
           [[v_por.get(n, 0) for n in ns]], [AZUL])
    barras("commits-e-prs.svg", "Commits e PRs mergeados por sprint", "Commits desde 27/03 (início do Git); PRs desde 04/05 (início do fluxo com pull request).", rot,
           [[c_por.get(n, 0) for n in ns], [pm_por.get(n, 0) for n in ns]], [AZUL, AMARELO], ["Commits", "PRs mergeados (sem dependabot)"])
    barras("tipos-de-trabalho.svg", "Tipo de trabalho nos PRs mergeados", "Pelo prefixo do título (feat, fix, refactor...). Só sprints com PRs.", rot,
           [[tp[t].get(n, 0) for n in ns] for t in tipos], [AZUL, VERMELHO, VERDE, "#9DB0D0", CIANO, LARANJA, "#C7D2E8"],
           ["feat (nova funcionalidade)", "fix (correção)", "refactor", "chore", "docs", "ci", "outro"], empilhado=True)
    med = [round(statistics.median(ciclo[n]), 1) if ciclo.get(n) else 0 for n in ns]
    med_min = [round(m * 60) for m in med]
    barras("tempo-de-ciclo.svg", "Tempo de ciclo do PR (mediana, em minutos)", "Da abertura do PR até o merge (inclui a espera do CI). Menor = feedback e entrega mais rápidos.", rot, [med_min], [VERDE])
    barras("pedidos-do-cliente.svg", "Entregas ligadas ao cliente por sprint", "Versões do CHANGELOG que citam pedido, relato ou teste do Maikon (o dono da loja).", rot,
           [[cli_por.get(n, 0) for n in ns], [volta_por.get(n, 0) for n in ns]], [AMARELO, AZUL], ["Pedidos/relatos do cliente", "Mudanças \"com volta\" (chave de funcionalidade)"])
    linha("burnup-versoes.svg", "Entrega acumulada (burn-up de versões)", "Versões lançadas desde v1.0.0.", rot, acum)

    # Kanban: BACKLOG + PRs abertos + CHANGELOG
    backlog = (RAIZ / "docs/planejamento/BACKLOG.md").read_text(encoding="utf-8")

    def secao(titulo_parcial):
        m = re.search(rf"^## [^\n]*{titulo_parcial}[^\n]*\n(.*?)(?=^## |\Z)", backlog, re.M | re.S)
        return m.group(1) if m else ""

    EMOJI = re.compile("[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F\u2B50]")

    def limpo(t, lim=88):
        t = re.sub(r"[`*]", "", EMOJI.sub("", t)).strip(" |.\u00a0")
        t = re.sub(r"\s+", " ", t)
        return t if len(t) <= lim else t[: lim - 1].rstrip() + "…"

    def itens(txt, n, tabela=False):
        out = []
        for l in txt.splitlines():
            if tabela:
                if not l.startswith("|") or l.startswith("|---") or re.match(r"\|\s*(Item|Versão)", l):
                    continue
                cel = l.split("|")[1]
            else:
                m = re.match(r"\d+b?\.\s+(.*)", l)  # só item numerado de 1º nível (sub-itens começam com espaços)
                if not m:
                    continue
                cel = m.group(1)
            m = re.search(r"\*\*(.+?)\*\*", cel)
            t = limpo(m.group(1) if m else cel)
            if len(t) > 6:
                out.append(t)
            if len(out) >= n:
                break
        return out

    abertos = [p for p in ps if p["state"] == "OPEN" and tipo_pr(p) != "dependabot"]
    cards_fila = [(f"Fila {i + 1}", t) for i, t in enumerate(itens(secao("Na fila"), 5))]
    cards_espera = [("Aguarda", t) for t in itens(secao("Esperando alguém"), 4, True)]
    cards_andamento = [("Em andamento", t) for t in itens(secao("Em andamento"), 3, True)]
    cards_revisao = [(f"PR #{p['number']}", limpo(re.sub(r"^\w+(\([^)]*\))?:\s*", "", p["title"]))) for p in abertos][:4]
    ult = sorted(vs, key=lambda v: v["data"], reverse=True)[:5]
    cl = (RAIZ / "frontend/public/CHANGELOG.md").read_text(encoding="utf-8")
    cards_feito = []
    for v in ult:
        m = re.search(rf"^## \[{re.escape(v['versao'])}\][^\n]*\n+### ([^\n]+)", cl, re.M)
        cards_feito.append((f"{v['versao']} · {v['data']:%d/%m}", limpo(m.group(1) if m else "")))
    colunas = [("A fazer (fila)", SUAVE, cards_fila), ("Esperando alguém", LARANJA, cards_espera),
               ("Em andamento", AZUL, cards_andamento), ("Em revisão (PR + CI)", "#7C3AED", cards_revisao),
               ("Feito (em produção)", VERDE, cards_feito)]
    kanban_svg(colunas)

    # métricas consolidadas
    todos_ciclos = [h for l in ciclo.values() for h in l]
    metricas = {
        "periodo": f"{INICIO:%d/%m/%Y} a {HOJE:%d/%m/%Y}", "sprints_completas": ultima, "dias_por_sprint": DIAS,
        "versoes": len(vs), "commits": len(cs), "prs_total": len(ps), "prs_dev_mergeados": len(merg), "prs_dependabot_mergeados": dep_merg,
        "ciclo_mediano_h": round(statistics.median(todos_ciclos), 1) if todos_ciclos else None,
        "ciclo_medio_h": round(statistics.mean(todos_ciclos), 1) if todos_ciclos else None,
        "ciclo_p90_h": round(sorted(todos_ciclos)[int(len(todos_ciclos) * .9) - 1], 1) if len(todos_ciclos) > 10 else None,
        "versoes_com_cliente": sum(1 for v in vs if v["cliente"]), "versoes_com_volta": sum(1 for v in vs if v["volta"]),
        "linhas_adicionadas_prs": sum(linhas_ad.values()), "linhas_removidas_prs": sum(linhas_rm.values()),
        "por_sprint": {str(n): {"inicio": f"{janela(n)[0]:%Y-%m-%d}", "fim": f"{janela(n)[1]:%Y-%m-%d}", "versoes": v_por.get(n, 0), "commits": c_por.get(n, 0),
                                "prs": pm_por.get(n, 0), "cliente": cli_por.get(n, 0), "volta": volta_por.get(n, 0), "ciclo_mediano_h": med[n - 1]} for n in ns},
    }
    (SAIDA / "metricas.json").write_text(json.dumps(metricas, ensure_ascii=False, indent=2), encoding="utf-8")

    # semanas ativas / throughput
    semanas = max(1, (HOJE - PRIM_COMMIT).days // 7)
    vazao = round(len(merg) / max(1, (HOJE - dt.date(2026, 5, 4)).days / 7), 1)

    # sprints.md
    md = ["# Sprints — reconstrução retroativa", "",
          "> **Como ler:** o projeto não rodava cerimônias de Scrum formais; o trabalho fluía em entregas contínuas ao cliente. Estas sprints são "
          f"**janelas fixas de {DIAS} dias** a partir da primeira versão (01/03/2026), montadas depois, a partir do histórico. "
          "**Datas, versões, commits e PRs são reais**; a *meta* de cada sprint é um resumo do que foi efetivamente entregue.", "",
          "Dados de commits só existem a partir de 27/03 (início do Git) e de PRs a partir de 04/05; antes disso a coluna fica em branco (—).", "",
          "| Sprint | Período | Meta (resumo do que foi entregue) | Versões | Commits | PRs | Pedidos do cliente | \"Com volta\" |",
          "|:-:|---|---|:-:|:-:|:-:|:-:|:-:|"]
    for n in ns:
        a, b = janela(n)
        c = c_por.get(n, 0) if b >= PRIM_COMMIT else "—"
        p = pm_por.get(n, 0) if b >= dt.date(2026, 5, 4) else "—"
        md.append(f"| {n} | {a:%d/%m}–{b:%d/%m} | {METAS[n]} | {v_por.get(n, 0)} | {c} | {p} | {cli_por.get(n, 0)} | {volta_por.get(n, 0)} |")
    a, b = janela(ultima + 1)
    md += [f"| **{ultima + 1}** | **{a:%d/%m}–{b:%d/%m}** | **(em andamento) Fechar o PIM IV: app, banco, documentação e iPhone — entrega em {ENTREGA_PIM:%d/%m}** | — | — | — | — | — |", "",
           "## Totais", "",
           f"- **{len(vs)} versões** lançadas em {ultima} sprints; **{len(cs)} commits** desde 27/03; **{len(merg)} PRs** de desenvolvimento mergeados (mais {dep_merg} de atualização automática de dependências).",
           f"- **{metricas['versoes_com_cliente']} versões** citam pedido, relato ou teste do dono da loja; **{metricas['versoes_com_volta']}** foram entregues como \"mudança com volta\".",
           f"- Ritmo: de 1 versão por quinzena (sprints 1–5) a **47 versões** na sprint 17 e **32** na sprint 18.", "",
           "## Gráficos", "",
           "![Versões por sprint](img/versoes-por-sprint.svg)", "",
           "![Commits e PRs por sprint](img/commits-e-prs.svg)", "",
           "![Burn-up de versões](img/burnup-versoes.svg)", "",
           "![Pedidos do cliente por sprint](img/pedidos-do-cliente.svg)", "",
           f"## Sprint {ultima + 1} — Sprint Backlog (plano até {ENTREGA_PIM:%d/%m})", "",
           "Situação conferida em 07/11/2026 (fim da sprint 18). Os itens 1 a 4 foram adiantados ainda na sprint 18; os demais seguem até a entrega do PIM IV em 14/11.", "",
           "| # | Item | Etapa do PIM | Situação | Observação |", "|:-:|---|---|:-:|---|",
           "| 1 | App Android da Liga em Flutter (login, torneios, mesa, ranking) | 5 — Mobile | ✅ adiantado (07/11) | PR #159; testado em aparelho real |",
           "| 2 | Identidade visual do app (fonte, cores, logo, Pokémon como foto) | 5 — Mobile | ✅ adiantado (07/11) | PR #160 |",
           "| 3 | MER, modelo lógico, dicionário de dados e script físico | 7 — Banco | ✅ adiantado (07/11) | gerados do schema real |",
           "| 4 | Sprints, Kanban e métricas retroativos (este pacote) | 9 — Ágil | ✅ adiantado (07/11) | gerados do histórico |",
           "| 5 | Procedures e triggers no PostgreSQL | 7 — Banco | ⏳ a fazer | idempotentes no `postgres.sql`; testar no Postgres real |",
           "| 6 | App para iPhone: Flutter Web (PWA) + build iOS no CI | 5 — Mobile | ⏳ a fazer | depende de aprovação de hospedagem no site |",
           "| 7 | Tempo real por SignalR no app (hoje consulta a cada 8 s) | 5 — Mobile | ⏳ a fazer | |",
           "| 8 | APK de release assinado + página \"Baixar o app\" | 5 — Mobile | ⏳ a fazer | |",
           "| 9 | Diagramas de arquitetura (camadas e classes da Liga) | 6 — Arquitetura | ⏳ a fazer | gerar do código |",
           "| 10 | Trabalho escrito em ABNT (etapas 1, 2, 3, 6, 8) | Escrito | ⏳ a fazer | texto autoral do grupo |",
           "| 11 | Retirada do MongoDB (roteiro em `docs/planejamento/MONGO-FORA.md`) | 7 — Banco | 🔁 fora do caminho crítico | migra vendas do PDV; só entra se validada até 11/11 |", ""]
    (SAIDA / "sprints.md").write_text("\n".join(md), encoding="utf-8")

    # metricas.md
    md = ["# Métricas de fluxo", "",
          "> Geradas por `scripts/gerar-metricas-agil.py` a partir do CHANGELOG, do Git e do GitHub. Nada aqui foi digitado à mão.", "",
          "| Métrica | Valor | O que significa |", "|---|---|---|",
          f"| Versões lançadas | **{len(vs)}** | entregas ao cliente desde v1.0.0 |",
          f"| Commits | **{len(cs)}** | desde 27/03/2026 |",
          f"| PRs de desenvolvimento mergeados | **{len(merg)}** | fluxo com pull request, CI e revisão (desde 04/05) |",
          f"| Vazão média | **{vazao} PRs/semana** | PRs mergeados por semana desde o início do fluxo |",
          f"| Tempo de ciclo — mediana | **{fmt_h(metricas['ciclo_mediano_h'])}** | da abertura do PR ao merge (inclui a espera do CI) |",
          f"| Tempo de ciclo — média | **{fmt_h(metricas['ciclo_medio_h'])}** | puxada por poucos PRs que ficaram abertos mais tempo |",
          f"| Tempo de ciclo — percentil 90 | **{fmt_h(metricas['ciclo_p90_h'])}** | 9 em cada 10 PRs fecham em até isso |",
          f"| Linhas nos PRs (+ / −) | **+{metricas['linhas_adicionadas_prs']:,} / −{metricas['linhas_removidas_prs']:,}**".replace(",", ".") + " | volume de mudança; as remoções mostram a limpeza de código |",
          f"| Versões ligadas ao cliente | **{metricas['versoes_com_cliente']}** | citam pedido, relato ou teste do Maikon |",
          f"| Mudanças \"com volta\" | **{metricas['versoes_com_volta']}** | entregues atrás de chave de funcionalidade, com o jeito antigo guardado |", "",
          "![Tempo de ciclo](img/tempo-de-ciclo.svg)", "",
          "![Tipo de trabalho](img/tipos-de-trabalho.svg)", "",
          "## O que os números mostram", "",
          "- **Entrega contínua e pequena:** a mediana de poucos minutos por PR (a maior parte é a espera do CI) indica mudanças pequenas e revisadas rápido, em vez de grandes pacotes.",
          "- **Cliente no circuito:** uma parte relevante das versões nasce de pedido ou relato direto do dono da loja, o que é o ciclo de feedback do ágil na prática.",
          "- **Risco controlado:** a partir da sprint 16, mudanças grandes passam a entrar como \"com volta\" (chave de funcionalidade), permitindo reverter sem novo deploy.",
          "- **Dívida técnica paga:** as sprints 17–18 removem código (NFC-e, WhatsApp automático, \"jeito antigo\" guardado) e reorganizam o back em camadas.", ""]
    (SAIDA / "metricas.md").write_text("\n".join(md), encoding="utf-8")

    # kanban.md
    md = ["# Quadro Kanban", "",
          "![Quadro Kanban](img/kanban.svg)", "",
          f"> Foto de {HOJE:%d/%m/%Y} montada por `scripts/gerar-metricas-agil.py` com o `docs/planejamento/BACKLOG.md`, os PRs abertos e o CHANGELOG.", "",
          "## Colunas e como o fluxo real do projeto se encaixa", "",
          "| Coluna | O que significa | Onde isso vive hoje |", "|---|---|---|",
          "| **A fazer (fila)** | priorizado, ainda não começou | seção \"Na fila\" do `BACKLOG.md` |",
          "| **Esperando alguém** | travado numa decisão ou insumo de fora (cliente, chave, print) | seção \"Esperando alguém\" |",
          "| **Em andamento** | alguém está trabalhando | seção \"Em andamento\" e a branch do trabalho |",
          "| **Em revisão (PR + CI)** | PR aberto: testes, Postgres real, carga, imagens Docker, CodeQL, mapa do sistema | pull request no GitHub |",
          "| **Feito (em produção)** | mergeado; o deploy abre sozinho e espera a aprovação do dono, com backup antes e troca sem queda | `CHANGELOG.md` |", "",
          "## Políticas explícitas", "",
          "- **Definição de pronto:** PR com CI verde, `CHANGELOG.md` e `BACKLOG.md` atualizados, mapa do sistema regenerado, teste em tela quando há mudança visual e aprovação do deploy pelo dono.",
          "- **Sem push direto na `main`:** todo trabalho vira branch → PR → merge.",
          "- **Mudança grande entra com volta:** atrás de chave de funcionalidade, com o jeito antigo guardado, para reverter sem deploy.",
          "- **Limite de trabalho em andamento (proposta):** no máximo 3 itens em desenvolvimento ao mesmo tempo, para manter o tempo de ciclo baixo. *(Hoje é prática informal; formalizar aqui.)*", "",
          "## Fluxo ao longo do tempo", "",
          f"- Tempo de ciclo mediano: **{fmt_h(metricas['ciclo_mediano_h'])}** (p90: {fmt_h(metricas['ciclo_p90_h'])}). Vazão média: **{vazao} PRs/semana**.",
          "- Gráficos em [`metricas.md`](metricas.md).", ""]
    (SAIDA / "kanban.md").write_text("\n".join(md), encoding="utf-8")

    print(f"ok: {len(vs)} versões, {len(cs)} commits, {len(merg)} PRs dev, ciclo mediano {fmt_h(metricas['ciclo_mediano_h'])} -> {SAIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
