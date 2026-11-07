#!/usr/bin/env python3
"""
Gera a documentação do banco de dados (PIM IV, etapa 7) a partir do PostgreSQL REAL.

Produz em docs/pim/banco/:
  README.md               visão geral, números, como ler, como regenerar
  mer-conceitual.md       MER conceitual por domínio (entidades de negócio e relacionamentos)
  modelo-logico.md        modelo lógico por domínio (tabelas, colunas, PK, FK, UK) gerado do schema
  dicionario-de-dados.md  uma seção por tabela, com todas as colunas
  schema.sql              script físico completo (pg_dump --schema-only)
  mmd/*.mmd               fontes Mermaid de cada diagrama (para renderizar em SVG/PNG)

Uso:
  # banco local de revisão (padrão: container do podman softnerd_postgres_dev)
  python3 scripts/gerar-modelo-dados.py

  # outro banco: informe o comando que abre o psql (lê SQL do stdin) e o do pg_dump
  PSQL_CMD="psql -h localhost -U user -d db" PGDUMP_CMD="pg_dump -h localhost -U user -d db" \
    python3 scripts/gerar-modelo-dados.py

Só lê o banco. Não grava nada nele.
"""
import json, os, re, shlex, subprocess, sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "docs" / "pim" / "banco"
PSQL = shlex.split(os.environ.get("PSQL_CMD", "podman exec -i softnerd_postgres_dev psql -U cardgame_user -d cardgamestore_rev"))
PGDUMP = shlex.split(os.environ.get("PGDUMP_CMD", "podman exec softnerd_postgres_dev pg_dump -U cardgame_user -d cardgamestore_rev"))


def sql(consulta: str):
    r = subprocess.run(PSQL + ["-At", "-c", consulta], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"psql falhou: {r.stderr.strip()}")
    return json.loads(r.stdout.strip() or "[]")


# ── Domínios (agrupam as tabelas pra que cada diagrama caiba numa tela) ───────────────────────
DOMINIOS = [
    ("acesso", "Acesso e identidade",
     "Quem usa o sistema: clientes, equipe, perfis de permissão, sessões, avisos ao usuário e LGPD.",
     ["users", "perfis", "user_sessions", "cookie_consents", "lgpd_requests", "push_subscriptions", "notifications"]),
    ("catalogo", "Catálogo e estoque",
     "O que a loja vende: categorias (com subcategorias), produtos, variações de tamanho/cor e lista de espera.",
     ["product_categories", "products", "product_variants", "product_waitlist"]),
    ("vendas", "Comanda, reservas e pagamentos",
     "Venda na mesa (comanda), pré-venda/reserva do site, cobranças Pix e integração bancária.",
     ["comandas", "comanda_items", "product_reservations", "pix_cobrancas", "external_transactions", "integration_configs"]),
    ("crediario", "Crediário",
     "Contas a receber do cliente: dívida, lançamentos, pagamentos parciais e avisos de cobrança.",
     ["crediarios", "crediario_lancamentos", "pagamentos_crediario", "crediario_avisos", "crediario_aviso_config"]),
    ("campeonatos", "Campeonatos, Liga e torneios",
     "Campeonatos e Liga mensal, inscritos, rodadas e partidas do torneio suíço, decks e cronômetros.",
     ["championships", "championship_participants", "championship_preinscricoes", "torneio_rodadas", "torneio_partidas",
      "decks", "timers", "liga_mensal_manual_entries"]),
    ("mercado", "Mercado de cartas",
     "Anúncios de cartas entre jogadores e os interessados em cada anúncio.",
     ["card_listings", "listing_interests"]),
    ("sistema", "Sistema e operação",
     "Auditoria, alertas do Vigia, comunicados, chaves de funcionalidade, configuração do site e marcos de operação.",
     ["audit_logs", "alertas_sistema", "announcements", "funcionalidades", "marcos_operacao", "site_config", "app_migrations"]),
]

DESCRICAO = {
    "users": "Pessoas que usam o sistema (cliente, operador ou administrador): dados de contato, senha com hash, pontos, saldo e Pokémon preferido.",
    "perfis": "Perfis de permissão da equipe (quais telas e ações cada operador pode usar).",
    "user_sessions": "Sessões de login (refresh token com rotação), por dispositivo.",
    "cookie_consents": "Registro do consentimento de cookies (LGPD), com a escolha feita e a versão do aviso.",
    "lgpd_requests": "Pedidos do titular de dados (acesso, correção, anonimização) e seu andamento.",
    "push_subscriptions": "Inscrições de notificação Web Push de cada navegador/aparelho.",
    "notifications": "Notificações dentro do site para cada usuário.",
    "product_categories": "Categorias de produto, com subcategorias (auto-relacionamento) e desconto Pix próprio.",
    "products": "Produtos à venda: preço, custo, estoque, promoção, pré-venda, foto e dados de busca.",
    "product_variants": "Variações de um produto (tamanho/cor) com estoque próprio.",
    "product_waitlist": "Lista de espera de quem quer ser avisado quando um produto voltar ao estoque.",
    "comandas": "Comanda aberta por mesa/cliente: status, forma de pagamento, desconto, pontos aplicados e estorno.",
    "comanda_items": "Itens de uma comanda, com nome e preço guardados no momento da venda (snapshot).",
    "product_reservations": "Reservas e pré-vendas feitas pelo site, agrupadas por carrinho (grupo de reserva).",
    "pix_cobrancas": "Cobranças Pix geradas (comanda, pedido do site, crediário ou inscrição em torneio) e sua situação.",
    "external_transactions": "Lançamentos financeiros de fonte externa ou manual (receitas e despesas).",
    "integration_configs": "Credenciais e dados de integração bancária (Pix) e sua última sincronização.",
    "crediarios": "Conta de crediário de um cliente: valor, vencimento, situação e origem.",
    "crediario_lancamentos": "Lançamentos (compras fiado) que compõem a conta do crediário.",
    "pagamentos_crediario": "Pagamentos (baixas) feitos contra uma conta de crediário.",
    "crediario_avisos": "Avisos de cobrança enviados ao cliente por conta de crediário.",
    "crediario_aviso_config": "Configuração dos avisos automáticos de crediário (horário, marcos, canais).",
    "championships": "Campeonatos e Liga: jogo, datas, vagas, taxa, modalidade, formato do torneio e rodada atual.",
    "championship_participants": "Inscritos em um campeonato (usuário, deck, pagamento, check-in, desistência e colocação).",
    "championship_preinscricoes": "Pré-inscrições feitas sem conta, antes da abertura das vagas.",
    "torneio_rodadas": "Rodadas de um torneio suíço (número, início e marca de que começou).",
    "torneio_partidas": "Partidas de uma rodada: dois inscritos, mesa, relatórios de resultado de cada lado e resultado final.",
    "decks": "Decks cadastrados pelos jogadores (nome, jogo e lista de cartas).",
    "timers": "Cronômetros (da rodada e do painel): duração, estado, início e alarme.",
    "liga_mensal_manual_entries": "Pontos da Liga lançados à mão pelo organizador (etapas jogadas fora do sistema).",
    "card_listings": "Anúncios do Mercado de Cartas (carta, preço, estado e anunciante).",
    "listing_interests": "Interessados em um anúncio do Mercado de Cartas.",
    "audit_logs": "Trilha de auditoria: quem fez o quê, em qual entidade e quando.",
    "alertas_sistema": "Alertas gerados pelo Vigia do sistema, com gravidade e ocorrências.",
    "announcements": "Comunicados da loja exibidos no site.",
    "funcionalidades": "Chaves de funcionalidade (liga/desliga de recursos novos sem novo deploy).",
    "marcos_operacao": "Marcos de operação (ex.: último backup diário), usados pelo Vigia.",
    "site_config": "Configuração do site (nome, cores, textos, contatos, imagens) — uma linha só.",
    "app_migrations": "Controle de ajustes de dados já aplicados na inicialização (para rodar uma vez só).",
}

TIPO_CURTO = {
    "character varying": "varchar", "timestamp with time zone": "timestamptz", "timestamp without time zone": "timestamp",
    "integer": "int", "double precision": "float8", "boolean": "bool", "numeric": "decimal", "character": "char",
}


def tipo_mermaid(c):
    t = TIPO_CURTO.get(c["tipo"], c["tipo"])
    if c["tipo"] == "character varying" and c.get("tam"):
        return f"varchar({c['tam']})"
    return re.sub(r"[^A-Za-z0-9_()\[\]-]", "_", t)


def tipo_texto(c):
    t = c["tipo"]
    if t == "character varying":
        return f"varchar({c['tam']})" if c.get("tam") else "varchar"
    if t == "numeric" and c.get("prec"):
        return f"numeric({c['prec']},{c['esc'] or 0})"
    return TIPO_CURTO.get(t, t)


def carregar():
    colunas = sql("""select json_agg(t) from (select c.table_name as tabela, c.column_name as coluna, c.ordinal_position as pos,
        c.data_type as tipo, c.character_maximum_length as tam, c.numeric_precision as prec, c.numeric_scale as esc,
        (c.is_nullable='YES') as nulo, c.column_default as padrao
        from information_schema.columns c join information_schema.tables t on t.table_name=c.table_name and t.table_schema=c.table_schema
        where c.table_schema='public' and t.table_type='BASE TABLE' order by c.table_name, c.ordinal_position) t""")
    restr = sql("""select json_agg(t) from (select con.conrelid::regclass::text as tabela, con.contype as tipo, con.conname as nome,
        (select json_agg(a.attname order by x.ord) from unnest(con.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=x.attnum) as colunas,
        con.confrelid::regclass::text as ref_tabela,
        (select json_agg(a.attname order by x.ord) from unnest(con.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=x.attnum) as ref_colunas,
        con.confdeltype as ao_apagar
        from pg_constraint con join pg_namespace n on n.oid=con.connamespace
        where n.nspname='public' and con.contype in ('p','f','u') order by 1,2,3) t""")
    indices = sql("select json_agg(t) from (select tablename as tabela, indexname as nome, indexdef as def from pg_indexes where schemaname='public' order by 1,2) t")
    return colunas, restr, indices


# ── MER conceitual (escrito à mão: é o vocabulário do negócio, não o do schema) ───────────────
# Linha tracejada (..) = relação que existe no sistema mas SEM chave estrangeira no banco.
CONCEITUAL = {
    "visao-geral": ("Visão geral do negócio", """erDiagram
  PERFIL ||--o{ USUARIO : "define permissões"
  USUARIO ||--o{ COMANDA : abre
  USUARIO ||--o{ RESERVA : faz
  USUARIO ||--o{ CREDIARIO : deve
  USUARIO ||--o{ PARTICIPANTE : "se inscreve como"
  USUARIO ||--o{ DECK : monta
  USUARIO ||--o{ ANUNCIO_CARTA : anuncia
  COMANDA ||--o{ ITEM_COMANDA : contem
  PRODUTO ||--o{ ITEM_COMANDA : "é vendido em"
  PRODUTO ||--o{ VARIANTE : "tem grade de"
  PRODUTO ||--o{ RESERVA : "é reservado em"
  COMANDA ||--o{ COBRANCA_PIX : gera
  COMANDA ||--o{ CREDIARIO : "origina"
  CREDIARIO ||--o{ LANCAMENTO : "é composto por"
  CREDIARIO ||--o{ PAGAMENTO : "é quitado por"
  CAMPEONATO ||--o{ PARTICIPANTE : reune
  CAMPEONATO ||--o{ RODADA : "se divide em"
  RODADA ||--o{ PARTIDA : tem
  PARTICIPANTE ||--o{ PARTIDA : joga
  VENDA_AVULSA }o..o| USUARIO : "pode identificar (MongoDB)"
  VENDA_AVULSA ||..o{ COBRANCA_PIX : "pode originar (MongoDB)"
"""),
    "acesso": ("Acesso e identidade", """erDiagram
  PERFIL ||--o{ USUARIO : "define permissões de"
  USUARIO ||--o{ SESSAO : "mantém"
  USUARIO ||--o{ NOTIFICACAO : "recebe"
  USUARIO ||--o{ INSCRICAO_PUSH : "registra"
  USUARIO |o--o{ CONSENTIMENTO_COOKIES : "dá"
  USUARIO |o--o{ SOLICITACAO_LGPD : "faz"
  USUARIO {
    uuid id PK
    string nome
    string email
    string cpf
    string whatsapp
    string papel "cliente, operador ou administrador"
    int pontos
    decimal saldo
    string pokemon_preferido
  }
  PERFIL {
    uuid id PK
    string nome
    string permissoes
  }
  SESSAO {
    uuid id PK
    datetime expira_em
    string dispositivo
  }
  NOTIFICACAO {
    uuid id PK
    string titulo
    bool lida
  }
  INSCRICAO_PUSH {
    uuid id PK
    string endpoint
  }
  CONSENTIMENTO_COOKIES {
    string id PK
    string escolha
  }
  SOLICITACAO_LGPD {
    string id PK
    string tipo
    string situacao
  }
"""),
    "catalogo": ("Catálogo e estoque", """erDiagram
  CATEGORIA |o--o{ CATEGORIA : "tem subcategorias"
  CATEGORIA ||..o{ PRODUTO : "classifica (pelo nome)"
  PRODUTO ||--o{ VARIANTE : "tem grade de"
  PRODUTO ||--o{ LISTA_ESPERA : "tem fila de"
  USUARIO |o--o{ LISTA_ESPERA : "entra na"
  CATEGORIA {
    uuid id PK
    string nome
    decimal desconto_pix
  }
  PRODUTO {
    uuid id PK
    string nome
    string categoria
    decimal preco
    decimal custo
    int estoque
    bool pre_venda
  }
  VARIANTE {
    uuid id PK
    string tamanho
    string cor
    int estoque
  }
  LISTA_ESPERA {
    uuid id PK
    datetime entrou_em
  }
  USUARIO {
    uuid id PK
    string nome
  }
"""),
    "vendas": ("Comanda, reservas e pagamentos", """erDiagram
  USUARIO ||--o{ COMANDA : abre
  COMANDA ||--o{ ITEM_COMANDA : contem
  PRODUTO ||--o{ ITEM_COMANDA : "é vendido em"
  USUARIO ||--o{ RESERVA : faz
  PRODUTO ||--o{ RESERVA : "é reservado em"
  VARIANTE |o--o{ RESERVA : "escolhida em"
  COMANDA ||--o{ COBRANCA_PIX : gera
  RESERVA }o..o| COBRANCA_PIX : "paga por (grupo de reserva)"
  VENDA_AVULSA ||..o{ COBRANCA_PIX : "pode originar (MongoDB)"
  VENDA_AVULSA }o..o| RESERVA : "homologa (MongoDB)"
  COMANDA {
    uuid id PK
    string status
    string forma_pagamento
    decimal desconto
    int pontos_aplicados
    datetime estornada_em
  }
  ITEM_COMANDA {
    uuid id PK
    string nome_no_momento "snapshot"
    decimal preco_no_momento "snapshot"
    int quantidade
  }
  RESERVA {
    uuid id PK
    uuid grupo_reserva
    string situacao
    int quantidade
  }
  COBRANCA_PIX {
    uuid id PK
    string txid
    decimal valor
    string situacao
  }
  VENDA_AVULSA {
    string id "ObjectId do MongoDB"
    decimal total
    string forma_pagamento
    datetime vendida_em
  }
  TRANSACAO_EXTERNA {
    uuid id PK
    string tipo
    decimal valor
    string situacao
  }
  CONFIG_INTEGRACAO {
    uuid id PK
    string origem
    datetime ultima_sincronizacao
  }
"""),
    "crediario": ("Crediário", """erDiagram
  USUARIO ||--o{ CREDIARIO : deve
  COMANDA ||--o{ CREDIARIO : "origina"
  CREDIARIO ||--o{ LANCAMENTO : "é composto por"
  CREDIARIO ||--o{ PAGAMENTO : "é quitado por"
  CREDIARIO ||--o{ AVISO_COBRANCA : "gera"
  CREDIARIO ||--o{ COBRANCA_PIX : "pode ser pago por"
  COMANDA ||..o{ LANCAMENTO : "origina (sem FK)"
  VENDA_AVULSA ||..o{ LANCAMENTO : "origina (MongoDB)"
  CREDIARIO {
    uuid id PK
    decimal valor
    date vencimento
    string situacao
  }
  LANCAMENTO {
    uuid id PK
    decimal valor
    string observacao
  }
  PAGAMENTO {
    uuid id PK
    decimal valor
    datetime pago_em
  }
  AVISO_COBRANCA {
    uuid id PK
    string canal
    datetime enviado_em
  }
  CONFIG_AVISO {
    uuid id PK
    bool ativo
    string horario
  }
"""),
    "campeonatos": ("Campeonatos, Liga e torneios", """erDiagram
  CAMPEONATO ||--o{ PARTICIPANTE : reune
  USUARIO ||--o{ PARTICIPANTE : "se inscreve como"
  CAMPEONATO ||--o{ PRE_INSCRICAO : "recebe"
  CAMPEONATO ||--o{ RODADA : "se divide em"
  RODADA ||--o{ PARTIDA : tem
  PARTICIPANTE ||--o{ PARTIDA : "joga como A"
  PARTICIPANTE ||--o{ PARTIDA : "joga como B"
  USUARIO ||--o{ DECK : monta
  DECK }o..o| PARTICIPANTE : "usado por (sem FK)"
  CAMPEONATO |o--o{ COMANDA : "consome em"
  PARTICIPANTE |o--o{ COMANDA : "abre"
  PARTICIPANTE ||--o{ COBRANCA_PIX : "paga inscrição por"
  CAMPEONATO |o..o{ CRONOMETRO : "marca tempo de (sem FK)"
  CAMPEONATO {
    uuid id PK
    string nome
    string jogo
    string modalidade "Liga ou Campeonato"
    int vagas
    decimal taxa
    string situacao
    int rodada_atual
  }
  PARTICIPANTE {
    uuid id PK
    bool pago
    datetime check_in
    int desistiu_na_rodada
    int colocacao
  }
  RODADA {
    uuid id PK
    int numero
    datetime iniciada_em
  }
  PARTIDA {
    uuid id PK
    int mesa
    string relatorio_a
    string relatorio_b
    string resultado
  }
  DECK {
    uuid id PK
    string nome
  }
  CRONOMETRO {
    uuid id PK
    int duracao_segundos
    string estado
  }
  LANCAMENTO_LIGA {
    uuid id PK
    string jogador
    int pontos
  }
  PRE_INSCRICAO {
    uuid id PK
    string nome
  }
"""),
    "mercado": ("Mercado de cartas", """erDiagram
  USUARIO ||--o{ ANUNCIO_CARTA : anuncia
  ANUNCIO_CARTA ||--o{ INTERESSE : "desperta"
  USUARIO ||--o{ INTERESSE : demonstra
  ANUNCIO_CARTA {
    uuid id PK
    string carta
    decimal preco
    string estado
  }
  INTERESSE {
    uuid id PK
    string mensagem
    datetime criado_em
  }
  USUARIO {
    uuid id PK
    string nome
  }
"""),
    "sistema": ("Sistema e operação", """erDiagram
  USUARIO |o..o{ AUDITORIA : "é autor de (sem FK)"
  AUDITORIA {
    string id PK
    string acao
    string entidade
    datetime quando
  }
  ALERTA_SISTEMA {
    uuid id PK
    string gravidade
    string titulo
    int ocorrencias
  }
  COMUNICADO {
    uuid id PK
    string titulo
    bool ativo
  }
  FUNCIONALIDADE {
    string codigo PK
    bool ligada
  }
  MARCO_OPERACAO {
    string chave PK
    datetime quando
  }
  CONFIG_SITE {
    uuid id PK
    string nome_do_site
    string cores
  }
  CONTROLE_AJUSTES {
    string chave PK
    datetime aplicado_em
  }
"""),
}


def entidade_md(nome):
    return nome


def gerar_logico(colunas, restr, dominio):
    """Mermaid erDiagram de um domínio, gerado do schema real."""
    _, titulo, _, tabelas = dominio
    pks = {(r["tabela"], c) for r in restr if r["tipo"] == "p" for c in r["colunas"]}
    uks = {(r["tabela"], c) for r in restr if r["tipo"] == "u" for c in r["colunas"]}
    fks = [r for r in restr if r["tipo"] == "f"]
    fkcols = {(r["tabela"], c): r for r in fks for c in r["colunas"]}
    porTabela = defaultdict(list)
    for c in colunas:
        porTabela[c["tabela"]].append(c)

    dentro = set(tabelas)
    relevantes = [f for f in fks if f["tabela"] in dentro or f["ref_tabela"] in dentro]
    externas = {x for f in relevantes for x in (f["tabela"], f["ref_tabela"])} - dentro

    linhas = ["erDiagram"]
    for f in relevantes:
        nulo = next(c["nulo"] for c in porTabela[f["tabela"]] if c["coluna"] == f["colunas"][0])
        card = "|o--o{" if nulo else "||--o{"
        linhas.append(f'  {f["ref_tabela"]} {card} {f["tabela"]} : "{f["colunas"][0]}"')

    def entidade(tab, so_chaves):
        saida = [f"  {tab} {{"]
        for c in porTabela[tab]:
            chave = []
            if (tab, c["coluna"]) in pks: chave.append("PK")
            if (tab, c["coluna"]) in fkcols: chave.append("FK")
            if (tab, c["coluna"]) in uks: chave.append("UK")
            if so_chaves and not chave:
                continue
            nul = ' "null"' if c["nulo"] and not chave else ""
            saida.append(f"    {tipo_mermaid(c)} {c['coluna']}{(' ' + ', '.join(chave)) if chave else ''}{nul}")
        saida.append("  }")
        return saida

    for tab in tabelas:
        linhas += entidade(tab, False)
    for tab in sorted(externas):
        linhas += entidade(tab, True)
    return "\n".join(linhas) + "\n"


def gerar_visao_geral(colunas, restr):
    """Todas as tabelas, só com PK e FKs — o 'mapa' do banco inteiro."""
    pks = {(r["tabela"], c) for r in restr if r["tipo"] == "p" for c in r["colunas"]}
    fks = [r for r in restr if r["tipo"] == "f"]
    fkcols = {(r["tabela"], c) for r in fks for c in r["colunas"]}
    porTabela = defaultdict(list)
    for c in colunas:
        porTabela[c["tabela"]].append(c)
    linhas = ["erDiagram"]
    for f in fks:
        nulo = next(c["nulo"] for c in porTabela[f["tabela"]] if c["coluna"] == f["colunas"][0])
        card = "|o--o{" if nulo else "||--o{"
        linhas.append(f'  {f["ref_tabela"]} {card} {f["tabela"]} : "{f["colunas"][0]}"')
    for tab in sorted(porTabela):
        linhas.append(f"  {tab} {{")
        for c in porTabela[tab]:
            k = []
            if (tab, c["coluna"]) in pks: k.append("PK")
            if (tab, c["coluna"]) in fkcols: k.append("FK")
            if k:
                linhas.append(f"    {tipo_mermaid(c)} {c['coluna']} {', '.join(k)}")
        linhas.append("  }")
    return "\n".join(linhas) + "\n"


ACAO = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def main():
    colunas, restr, indices = carregar()
    tabelas = sorted({c["tabela"] for c in colunas})
    dominio_de = {t: d[0] for d in DOMINIOS for t in d[3]}
    faltando = [t for t in tabelas if t not in dominio_de]
    sobrando = [t for t in dominio_de if t not in tabelas]
    if faltando or sobrando:
        sys.exit(f"Tabelas sem domínio: {faltando}; domínios com tabela inexistente: {sobrando}. Atualize DOMINIOS/DESCRICAO.")
    sem_desc = [t for t in tabelas if t not in DESCRICAO]
    if sem_desc:
        sys.exit(f"Tabelas sem descrição: {sem_desc}")

    pks = {(r["tabela"], c) for r in restr if r["tipo"] == "p" for c in r["colunas"]}
    fks = [r for r in restr if r["tipo"] == "f"]
    fkmap = {(r["tabela"], r["colunas"][0]): r for r in fks}
    uks_idx = defaultdict(set)
    for i in indices:
        if "UNIQUE" in i["def"].upper() and "pkey" not in i["nome"]:
            m = re.search(r"\(([^)]*)\)", i["def"])
            if m and "," not in m.group(1):
                uks_idx[i["tabela"]].add(m.group(1).strip().strip('"'))
    n_cols, n_fks, n_pks, n_idx = len(colunas), len(fks), len([r for r in restr if r["tipo"] == "p"]), len(indices)

    (SAIDA / "mmd").mkdir(parents=True, exist_ok=True)

    # ── fontes Mermaid ────────────────────────────────────────────────────────────────────────
    mmd = {}
    for chave, (_titulo, codigo) in CONCEITUAL.items():
        mmd[f"mer-{chave}"] = codigo
    mmd["logico-visao-geral"] = gerar_visao_geral(colunas, restr)
    for d in DOMINIOS:
        mmd[f"logico-{d[0]}"] = gerar_logico(colunas, restr, d)
    for nome, codigo in mmd.items():
        (SAIDA / "mmd" / f"{nome}.mmd").write_text(codigo, encoding="utf-8")

    # ── schema.sql (físico) ───────────────────────────────────────────────────────────────────
    dump = subprocess.run(PGDUMP + ["--schema-only", "--no-owner", "--no-privileges"], capture_output=True, text=True)
    if dump.returncode != 0:
        sys.exit(f"pg_dump falhou: {dump.stderr.strip()}")
    cabecalho = ("-- Santuário Nerd — script físico do banco PostgreSQL (somente estrutura)\n"
                 "-- Gerado por scripts/gerar-modelo-dados.py (pg_dump --schema-only) a partir do banco real.\n"
                 "-- Na aplicação o banco nasce do EF Core + CardGameStore/Data/Inicializacao/postgres.sql (idempotente);\n"
                 "-- este arquivo é a foto do resultado, pra consulta e pro trabalho escrito.\n\n")
    corpo = re.sub(r"^\\(un)?restrict .*\n", "", dump.stdout, flags=re.M)
    (SAIDA / "schema.sql").write_text(cabecalho + corpo, encoding="utf-8")

    # ── mer-conceitual.md ────────────────────────────────────────────────────────────────────
    md = ["# MER conceitual — Santuário Nerd", "",
          "> Gerado/atualizado por `scripts/gerar-modelo-dados.py`. Os diagramas abaixo aparecem direto no GitHub (Mermaid); as imagens "
          "prontas pro trabalho escrito estão em `img/` (SVG e PNG).", "",
          "O MER conceitual descreve o **negócio**: as entidades que a loja reconhece (comanda, produto, crediário, campeonato...) e como "
          "se relacionam, sem se prender a nomes de tabela ou tipos de coluna. O modelo lógico (próximo documento) desce ao nível das tabelas.", "",
          "## Como ler", "",
          "| Notação | Significado |", "|---|---|",
          "| `||--o{` | um para muitos (obrigatório de um lado, opcional do outro) |",
          "| `|o--o{` | um (opcional) para muitos |",
          "| `}o..o|`, `||..o{` (linha **tracejada**) | relação que existe no sistema mas **sem chave estrangeira no banco** (a aplicação garante), ou que aponta pro MongoDB |",
          "| `PK` | identificador da entidade |", "",
          "## Visão geral", "",
          "```mermaid", CONCEITUAL["visao-geral"][1].strip(), "```", ""]
    for d in DOMINIOS:
        titulo, resumo = d[1], d[2]
        md += [f"## {titulo}", "", resumo, "", "```mermaid", CONCEITUAL[d[0]][1].strip(), "```", ""]
    md += ["## Entidades que vivem fora do PostgreSQL", "",
           "`VENDA_AVULSA` (venda feita no caixa/PDV e as geradas ao homologar pedidos do site) fica no **MongoDB**, na coleção `vendas_avulsas`, "
           "como documento autocontido: itens, total, forma de pagamento, desconto, cliente e estorno ficam **copiados** no momento da venda "
           "(nome e preço do produto não mudam se o cadastro mudar depois). Outras tabelas apontam pra ela por um identificador em texto "
           "(`venda_avulsa_id` em `crediario_lancamentos`, `product_reservations` e `pix_cobrancas`), por isso aparecem tracejadas. "
           "O Mongo também guarda o cache de cartas das APIs de TCG.", ""]
    (SAIDA / "mer-conceitual.md").write_text("\n".join(md), encoding="utf-8")

    # ── modelo-logico.md ─────────────────────────────────────────────────────────────────────
    md = ["# Modelo lógico — Santuário Nerd (PostgreSQL)", "",
          "> **Gerado do banco real** por `scripts/gerar-modelo-dados.py`. Não é desenho à mão: se o schema mudar, rode o script de novo.", "",
          f"**{len(tabelas)} tabelas · {n_cols} colunas · {n_pks} chaves primárias · {n_fks} chaves estrangeiras · {n_idx} índices** "
          "(banco PostgreSQL 16).", "",
          "Legenda: `PK` chave primária, `FK` chave estrangeira, `UK` valor único; `\"null\"` = coluna aceita nulo. Tabelas com sufixo *(ref.)* "
          "aparecem só pra mostrar a relação com outro domínio (só as chaves).", "",
          "## Mapa do banco inteiro", "", "```mermaid", mmd["logico-visao-geral"].strip(), "```", ""]
    for d in DOMINIOS:
        md += [f"## {d[1]}", "", d[2], "", "```mermaid", mmd[f"logico-{d[0]}"].strip(), "```", ""]
    # relações sem FK
    sem_fk = []
    for c in colunas:
        n = c["coluna"]
        if (n.endswith("_id") or n == "tx_id") and (c["tabela"], n) not in pks and (c["tabela"], n) not in fkmap:
            sem_fk.append(c)
    md += ["## Decisões de modelagem", "",
           "- **Chaves `uuid`** geradas pela aplicação (`Guid`) na maioria das tabelas; algumas tabelas de controle usam texto (`audit_logs`, `cookie_consents`, "
           "`lgpd_requests`) ou um código natural (`funcionalidades.codigo`, `marcos_operacao.chave`, `app_migrations.key`).",
           "- **Snapshot em vez de junção para histórico:** `comanda_items` guarda o nome e o preço do item no momento da venda; mudar o cadastro do produto "
           "depois não altera a comanda antiga nem o financeiro.",
           "- **Estorno em vez de exclusão:** venda não se apaga; é marcada como estornada (data, quem estornou e motivo) e sai das contas, "
           "mas continua no extrato.",
           "- **Datas em `timestamptz` (UTC)**; o \"dia\" do negócio é calculado no calendário de Brasília na aplicação.",
           "- **Sem migrations tradicionais:** o banco nasce do EF Core e de `CardGameStore/Data/Inicializacao/postgres.sql`, que roda a cada partida e precisa ser "
           "**idempotente** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). A tabela `app_migrations` marca ajustes de dados que devem rodar uma vez só.",
           "- **Regra de exclusão:** `CASCADE` onde o filho não faz sentido sem o pai (itens de comanda, lançamentos de crediário, partidas de uma rodada); "
           "`RESTRICT` onde apagar esconderia dinheiro (usuário com comanda ou crediário); `SET NULL` onde a referência é opcional (cliente que pediu anonimização).", "",
           "## Relações lógicas sem chave estrangeira", "",
           f"O banco declara **{n_fks} chaves estrangeiras**. Além delas, há **{len(sem_fk)} colunas de referência** que a aplicação respeita mas o banco "
           "não força (foram mantidas assim de propósito ou por histórico):", "",
           "| Coluna | Tipo | Aponta para (na prática) |", "|---|---|---|"]
    alvo = {"venda_avulsa_id": "venda do PDV (MongoDB `vendas_avulsas`)", "deck_id": "`decks.id`", "deck_a_id": "`decks.id`", "deck_b_id": "`decks.id`",
            "variant_id": "`product_variants.id`", "comanda_id": "`comandas.id`", "reservation_group_id": "grupo de reserva (carrinho) — sem tabela própria",
            "championship_id": "`championships.id`", "actor_user_id": "`users.id` (autor da ação)", "entity_id": "qualquer entidade auditada",
            "external_id": "identificador no sistema externo (banco)", "tx_id": "txid do Pix no banco", "client_id": "credencial da integração",
            "card_cache_id": "carta no cache do MongoDB"}
    for c in sem_fk:
        a = alvo.get(c["coluna"])
        if a is None and (c["coluna"].endswith("admin_id") or c["coluna"] in ("added_by_user_id", "alterada_por_id", "resolvido_por")):
            a = "`users.id` (quem fez a ação; id guardado como histórico)"
        md.append(f"| `{c['tabela']}.{c['coluna']}` | {tipo_texto(c)}{', nulo' if c['nulo'] else ''} | {a or '—'} |")
    md += ["", "> Possível evolução: transformar as referências para `users`, `decks`, `product_variants` e `comandas` em chaves estrangeiras "
           "(com `ON DELETE SET NULL`/`RESTRICT`), depois de limpar eventuais órfãos. Foi deixado de fora para não arriscar o banco em produção.", ""]
    (SAIDA / "modelo-logico.md").write_text("\n".join(md), encoding="utf-8")

    # ── dicionario-de-dados.md ───────────────────────────────────────────────────────────────
    idx_por_tab = defaultdict(list)
    for i in indices:
        idx_por_tab[i["tabela"]].append(i)
    por_tab = defaultdict(list)
    for c in colunas:
        por_tab[c["tabela"]].append(c)
    md = ["# Dicionário de dados — Santuário Nerd (PostgreSQL)", "",
          "> Gerado do banco real por `scripts/gerar-modelo-dados.py`. Para cada tabela: finalidade, colunas (tipo, nulo, padrão, chave) e índices.", "",
          "## Índice", ""]
    for d in DOMINIOS:
        md.append(f"- **{d[1]}**: " + ", ".join(f"[`{t}`](#{t})" for t in d[3]))
    md.append("")
    for d in DOMINIOS:
        md += [f"## {d[1]}", ""]
        for t in d[3]:
            md += [f"### {t}", "", DESCRICAO[t], "",
                   "| Coluna | Tipo | Nulo | Padrão | Chave / referência |", "|---|---|:-:|---|---|"]
            for c in por_tab[t]:
                k = []
                if (t, c["coluna"]) in pks: k.append("PK")
                fk = fkmap.get((t, c["coluna"]))
                if fk: k.append(f"FK → `{fk['ref_tabela']}.{fk['ref_colunas'][0]}` ({ACAO[fk['ao_apagar']].lower()})")
                if c["coluna"] in uks_idx[t]: k.append("único")
                padrao = (c["padrao"] or "").replace("|", "\\|")
                if len(padrao) > 38: padrao = padrao[:35] + "…"
                md.append(f"| `{c['coluna']}` | {tipo_texto(c)} | {'sim' if c['nulo'] else 'não'} | {('`' + padrao + '`') if padrao else ''} | {'; '.join(k)} |")
            ix = [i for i in idx_por_tab[t] if not i["nome"].endswith("_pkey")]
            if ix:
                md += ["", "Índices:", ""]
                for i in ix:
                    m = re.search(r"USING \w+ \((.*)\)(.*)$", i["def"])
                    cols_ix = m.group(1) if m else i["def"]
                    extra = m.group(2).strip() if m else ""
                    unico = "único · " if "UNIQUE" in i["def"].upper() else ""
                    md.append(f"- `{i['nome']}` — {unico}({cols_ix}){(' ' + extra) if extra else ''}")
            md.append("")
    (SAIDA / "dicionario-de-dados.md").write_text("\n".join(md), encoding="utf-8")

    # ── README.md ────────────────────────────────────────────────────────────────────────────
    unicos = sum(1 for i in indices if "UNIQUE" in i["def"].upper() and not i["nome"].endswith("_pkey"))
    parciais = sum(1 for i in indices if " WHERE " in i["def"].upper())
    md = ["# Banco de dados — PIM IV, etapa 7 (Programação de Banco de Dados)", "",
          "Documentação do banco do **Santuário Nerd**, gerada **a partir do PostgreSQL real** pelo script `scripts/gerar-modelo-dados.py`.", "",
          "## O que tem aqui", "",
          "| Arquivo | O que é | Pedido no manual |", "|---|---|---|",
          "| [`mer-conceitual.md`](mer-conceitual.md) | MER conceitual por domínio (entidades de negócio e relacionamentos) | MER |",
          "| [`modelo-logico.md`](modelo-logico.md) | Modelo lógico: tabelas, colunas, PK/FK/UK, decisões de modelagem, relações sem FK | Modelo lógico |",
          "| [`dicionario-de-dados.md`](dicionario-de-dados.md) | Uma seção por tabela, com todas as colunas e índices | Apoio ao lógico/físico |",
          "| [`schema.sql`](schema.sql) | Script físico completo (estrutura) | Script do banco |",
          "| `mmd/*.mmd` | Fonte Mermaid de cada diagrama | — |",
          "| `img/*.svg`, `img/*.png` | Diagramas renderizados, prontos pro trabalho escrito (ABNT) | — |", "",
          "## Números do banco (conferidos no schema)", "",
          f"- **{len(tabelas)} tabelas** em {len(DOMINIOS)} domínios, **{n_cols} colunas**",
          f"- **{n_pks} chaves primárias**, **{n_fks} chaves estrangeiras** declaradas, **{n_idx} índices** ({unicos} únicos, {parciais} parciais)",
          "- PostgreSQL 16 (dados relacionais) + MongoDB (vendas do caixa e cache de cartas, fora deste schema)", "",
          "## Procedures e triggers", "",
          "Hoje o banco tem **0 procedures e 0 triggers**: toda regra de negócio mora na aplicação (C#). O manual do PIM pede os dois; "
          "o plano de como incluí-los sem arriscar o sistema em produção está em `docs/pim/ANALISE-PIM-IV.md` (etapa 7). "
          "Este pacote cobre o MER, o modelo lógico e o script físico.", "",
          "## Como regenerar", "",
          "```bash",
          "# precisa do banco local no ar (podman start softnerd_postgres_dev) com a API já rodada uma vez pra criar o schema",
          "python3 scripts/gerar-modelo-dados.py",
          "# imagens: os .mmd abrem em https://mermaid.js.org; os SVG/PNG de img/ foram renderizados com Mermaid 11.4.1",
          "```", ""]
    (SAIDA / "README.md").write_text("\n".join(md), encoding="utf-8")

    print(f"ok: {len(tabelas)} tabelas, {n_cols} colunas, {n_fks} FKs, {n_idx} índices, {len(mmd)} diagramas -> {SAIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
