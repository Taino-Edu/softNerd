-- =============================================================================
-- sqlite.sql — roda em todo startup da API em dev (SQLite)
--
-- Espelho do postgres.sql para o banco local. SQLite não tem
-- ADD COLUMN IF NOT EXISTS: colunas novas vão em InicializacaoBanco.cs
-- (ColunasSqlite), uma por vez, com o erro de coluna duplicada engolido.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id           TEXT     NOT NULL PRIMARY KEY,
    user_id      TEXT     NOT NULL,
    token_hash   TEXT     NOT NULL,
    expires_at   TEXT     NOT NULL,
    rotated_at   TEXT     NULL,
    revoked_at   TEXT     NULL,
    user_agent   TEXT     NULL,
    ip_address   TEXT     NULL,
    created_at   TEXT     NOT NULL,
    last_used_at TEXT     NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_user_sessions_user             ON user_sessions (user_id);

CREATE TABLE IF NOT EXISTS crediario_lancamentos (
    id                TEXT    NOT NULL PRIMARY KEY,
    crediario_id      TEXT    NOT NULL REFERENCES crediarios(id) ON DELETE CASCADE,
    origem            TEXT    NOT NULL,
    comanda_id        TEXT    NULL,
    venda_avulsa_id   TEXT    NULL,
    valor_em_centavos INTEGER NOT NULL DEFAULT 0,
    itens_json        TEXT    NULL,
    descricao         TEXT    NULL,
    created_at        TEXT    NOT NULL,
    estornado_em      TEXT    NULL
);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_crediario ON crediario_lancamentos (crediario_id);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_comanda   ON crediario_lancamentos (comanda_id);
CREATE INDEX IF NOT EXISTS ix_crediario_lancamentos_venda     ON crediario_lancamentos (venda_avulsa_id);

CREATE TABLE IF NOT EXISTS crediario_aviso_config (
    id               TEXT    NOT NULL PRIMARY KEY,
    ativo            INTEGER NOT NULL DEFAULT 1,
    hora_envio       INTEGER NOT NULL DEFAULT 10,
    marcos_json      TEXT    NOT NULL DEFAULT '[-3,0,3,7,15,30]',
    canal_app        INTEGER NOT NULL DEFAULT 1,
    canal_email      INTEGER NOT NULL DEFAULT 1,
    canal_whatsapp   INTEGER NOT NULL DEFAULT 0,
    resumo_admin     INTEGER NOT NULL DEFAULT 1,
    mensagem_extra   TEXT    NULL,
    ultimo_resumo_em TEXT    NULL,
    updated_at       TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS crediario_avisos (
    id                    TEXT    NOT NULL PRIMARY KEY,
    crediario_id          TEXT    NOT NULL REFERENCES crediarios(id) ON DELETE CASCADE,
    marco                 INTEGER NULL,
    vencimento_referencia TEXT    NOT NULL,
    canais                TEXT    NOT NULL DEFAULT '',
    falhas                TEXT    NULL,
    enviado_por_admin_id  TEXT    NULL,
    enviado_em            TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_crediario_avisos_crediario ON crediario_avisos (crediario_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_crediario_avisos_marco
    ON crediario_avisos (crediario_id, marco, vencimento_referencia) WHERE marco IS NOT NULL;

-- Liguinha (docs/liguinha.md) — colunas novas em ColunasSqlite (InicializacaoBanco.cs)
CREATE TABLE IF NOT EXISTS torneio_rodadas (
    id              TEXT    NOT NULL PRIMARY KEY,
    championship_id TEXT    NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
    numero          INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'Aberta',
    iniciada_em     TEXT    NOT NULL,
    fechada_em      TEXT    NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_torneio_rodadas_numero ON torneio_rodadas (championship_id, numero);
CREATE TABLE IF NOT EXISTS torneio_partidas (
    id                     TEXT    NOT NULL PRIMARY KEY,
    rodada_id              TEXT    NOT NULL REFERENCES torneio_rodadas(id) ON DELETE CASCADE,
    mesa                   INTEGER NOT NULL,
    participante_a_id      TEXT    NOT NULL REFERENCES championship_participants(id) ON DELETE CASCADE,
    participante_b_id      TEXT    NULL     REFERENCES championship_participants(id) ON DELETE CASCADE,
    deck_a_id              TEXT    NULL,
    deck_a_nome            TEXT    NULL,
    deck_b_id              TEXT    NULL,
    deck_b_nome            TEXT    NULL,
    report_a               TEXT    NULL,
    report_b               TEXT    NULL,
    resultado              TEXT    NULL,
    vitorias_a             INTEGER NOT NULL DEFAULT 0,
    vitorias_b             INTEGER NOT NULL DEFAULT 0,
    resolvido_por_admin_id TEXT    NULL,
    fechada_em             TEXT    NULL
);
CREATE INDEX IF NOT EXISTS ix_torneio_partidas_rodada ON torneio_partidas (rodada_id);
