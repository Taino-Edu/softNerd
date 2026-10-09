# Liguinha — arquitetura

Gestor de torneio suíço (Pokémon TCG) dentro do softNerd, em `santuarionerd.com/liga`.
Substitui o app externo que o Maikon usa hoje. Pedido em 07–08/10/2026.

**Requisitos:** o próprio jogador lança os resultados; posição e pontuação da semana, do mês e do ano;
campeões da semana/mês/ano; vitórias, empates e derrotas; % de vitória com o deck; decks mais usados;
timer vinculado ao campeonato do dia, contando cada rodada sozinho.

---

**Status:** fase 1 pronta (v1.40.0) — torneio rodando de ponta a ponta. Fases 2 e 3 no fim do documento.

## 1. Princípio: o torneio é uma camada em cima do campeonato

Nada do que já existe é refeito. O campeonato continua sendo o dono da inscrição, do pagamento e da
colocação final; a liguinha só acrescenta **rodadas e partidas** no meio do caminho.

```
            JÁ EXISTE                                   NOVO                          JÁ EXISTE
┌───────────────────────────────┐   ┌──────────────────────────────────┐   ┌───────────────────────────┐
│ Championship                  │   │ TorneioService                   │   │ Liga Mensal               │
│  inscrição (/register)        │──▶│  rodadas · partidas · resultados │──▶│  Placement → 10/7/5/3/1   │
│  admin-register, pré-inscrição│   │  Suico (motor puro, testado)     │   │  + lançamento manual      │
│  Pix da inscrição, cobrança   │   │  TorneioHub (tempo real)         │   │                           │
│  lista de espera              │   └───────┬──────────────┬───────────┘   └─────────────┬─────────────┘
└───────────────────────────────┘           │              │                             │
┌───────────────────────────────┐           │              │               ┌─────────────▼─────────────┐
│ Deck (Meus decks)  + arquétipo│◀──────────┘              │               │ LigaEstatisticasService   │
│ TimerEntity  + campeonato     │◀─────────────────────────┘               │  semana · mês · ano       │
│ User  + Pokémon favorito      │                                          │  V/E/D · decks · campeões │
└───────────────────────────────┘                                          └───────────────────────────┘
```

O que **não muda**: o fluxo de inscrição, o Pix da inscrição, a Liga Mensal (continua lendo `Placement`),
o lançamento manual de pontos, as telas de campeonato que já existem.

---

## 2. Ciclo de um torneio

| Passo | Quem | O que acontece | Reaproveita |
|---|---|---|---|
| Criar | Organizador | Campeonato com formato suíço, melhor de 1/3, minutos por rodada | `POST /api/championship` |
| Inscrever | Jogador / organizador | Igual hoje, com ou sem Pix | `/register`, `/admin-register`, Pix |
| Iniciar | Organizador | Gera o código (ex.: KX7P2), status `EmAndamento`, rodada 1 sorteada, timer liga e conta | `PUT /status`, `TimerEntity` |
| Entrar | Jogador | Digita o código e escolhe o deck (check-in). Se não estava inscrito e as inscrições estão abertas, inscreve | `RegisterParticipantAsync` |
| Jogar | Jogadores | Cada um lança o próprio resultado; se baterem, fecha; se divergirem, vai pro organizador | — |
| Próxima rodada | Organizador | Um clique: emparelha por pontos, sem revanche, com bye; timer reinicia | — |
| Encerrar | Organizador | Classificação final vira `Placement` e pódio | `SetPlacementAsync`, `SetPodioAsync` |
| Ranking | Automático | Liga Mensal soma como sempre; estatísticas aparecem | `LigaMensalController` |

**Pré-inscritos sem conta** (só nome e WhatsApp) não têm `UserId`, e a partida precisa de um participante.
No check-in o organizador cria a conta na hora (cadastro rápido que já existe) ou o jogador fica de fora.
Jogador com conta mas sem celular: o organizador lança o resultado por ele.

---

## 3. Banco (tudo via `CardGameStore/Data/Inicializacao/postgres.sql` + `sqlite.sql`)

**Colunas novas em tabelas existentes**

| Tabela | Coluna | Para quê |
|---|---|---|
| `championships` | `codigo_entrada` (único entre ativos) | Entrar pelo celular |
| | `formato` (`Livre` padrão \| `Suico`) | Campeonato antigo continua `Livre`, sem rodadas |
| | `melhor_de` (1 \| 3), `minutos_rodada`, `numero_rodadas`, `rodada_atual` | Configuração do torneio |
| `championship_participants` | `check_in_em`, `desistiu_na_rodada` | Quem está jogando de fato |
| `decks` | `arquetipo_id` | "Decks mais usados" sem `zard`/`Charizard`/`Charizard ex` separados |
| `timers` | `championship_id`, `rodada` | Timer do campeonato do dia |
| `users` | `pokemon_favorito` (nº da Pokédex) | Miniatura ao lado do nome |

**Tabelas novas**

```
deck_arquetipos   id · nome · pokemon_principal · ativo · criado_em
torneio_rodadas   id · championship_id · numero · status (Aberta|Fechada) · iniciada_em · fechada_em
                  UNIQUE (championship_id, numero)          ← impede gerar a mesma rodada duas vezes
torneio_partidas  id · rodada_id · mesa · participante_a_id · participante_b_id (NULL = bye)
                  deck_a_id · deck_b_id · arquetipo_a_id · arquetipo_b_id   ← foto do deck naquele dia
                  report_a · report_b · resultado_final · vitorias_a · vitorias_b
                  resolvido_por_admin_id · fechada_em
```

O deck e o arquétipo ficam **copiados na partida**: se o jogador editar ou apagar o deck depois, a
estatística daquele dia não muda (mesma ideia do `itens_json` do crediário).

Pontos e estatísticas **não são gravados**: saem das partidas e das colocações na hora da consulta. Com o
volume de uma loja, isso fica em milissegundos e nunca fica desatualizado.

---

## 4. Back-end

```
CardGameStore/
  Services/Liga/
    Suico.cs                    motor puro: Emparelhar(), Classificar() — sem banco, só testes
    TorneioService.cs           iniciar, gerar rodada, lançar/resolver resultado, encerrar
    LigaEstatisticasService.cs  rankings por período, campeões, V/E/D, decks
  Controllers/
    TorneioController.cs        api/torneios/...
    LigaController.cs           api/liga/...  (LigaMensalController fica como está)
  Hubs/TorneioHub.cs            /hubs/torneio
```

**Motor suíço (`Suico.cs`)**
- Pontos 3/1/0. Bye vale vitória e vai pro último colocado que ainda não teve.
- Rodada 1 sorteada; depois, por grupos de pontuação, sem repetir oponente (com backtracking quando travar).
- Desempate padrão Play! Pokémon: OWP, depois OOWP, com piso de 25%; desistente continua contando
  como oponente.
- Número de rodadas sugerido por `ceil(log2(jogadores))`; o organizador pode mudar.

**Cuidados de concorrência** (mesma linha do Pix e do crediário)
- Gerar rodada: `UNIQUE (championship_id, numero)`, então dois cliques geram uma rodada só.
- Lançar resultado: `ExecuteUpdate` condicionado ao estado da partida, então dois reports simultâneos
  não se sobrescrevem.
- Encerrar: só com todas as partidas fechadas; grava as colocações numa transação.

---

## 5. APIs

### Novas — organizador (`AdminOnly`, igual ao resto de campeonato)
| Método | Rota | Faz |
|---|---|---|
| POST | `api/torneios/{id}/iniciar` | Código, status, rodada 1, liga e dispara o timer |
| POST | `api/torneios/{id}/rodadas` | Gera a próxima rodada (409 se houver partida aberta) |
| PUT | `api/torneios/{id}/partidas/{partidaId}` | Organizador define ou corrige o resultado |
| POST | `api/torneios/{id}/participantes/{pid}/desistencia` | Desistência (sai das próximas rodadas) |
| POST | `api/torneios/{id}/encerrar` | Colocação final → `Placement` + pódio → `Finalizado` |
| POST | `api/torneios/{id}/codigo` | Gera um código novo (se vazou) |
| GET/POST/PUT | `api/liga/arquetipos` (+ `/{id}/juntar`) | Lista de arquétipos; juntar duplicados |

### Novas — jogador (`Authorize`)
| Método | Rota | Faz |
|---|---|---|
| POST | `api/torneios/entrar` `{codigo, deckId}` | Check-in (ou inscrição, se ainda aberta). Limite de tentativas |
| GET | `api/torneios/{id}/minha-mesa` | Rodada, mesa, oponente, timer, o que cada um lançou |
| POST | `api/torneios/{id}/partidas/{partidaId}/resultado` | Lança o próprio resultado (só A ou B da partida) |
| POST | `api/torneios/{id}/desistir` | Sai do torneio |
| GET | `api/torneios/ativos` | Torneios em andamento em que estou |

### Novas — públicas (`AllowAnonymous`; só nome e Pokémon, nunca WhatsApp, CPF ou e-mail)
| Método | Rota | Faz |
|---|---|---|
| GET | `api/torneios/{id}/classificacao` | Tabela ao vivo (V/E/D/PTS, OWP) |
| GET | `api/torneios/{id}/rodadas/{n}` | Mesas da rodada |
| GET | `api/liga/ranking?periodo=semana\|mes\|ano&ref=2026-10` | Posição e pontuação no período |
| GET | `api/liga/campeoes?periodo=semana\|mes\|ano&ano=2026` | Campeões de cada semana/mês/ano |
| GET | `api/liga/decks?periodo=...` | Mais usados + % de vitória por arquétipo |
| GET | `api/liga/jogadores/{userId}` | V/E/D, aproveitamento, % por deck, títulos, histórico |

### Existentes que ganham campos (sem quebrar quem já usa)
| Rota | Muda |
|---|---|
| `POST/PUT api/championship` | Aceita formato, melhor de, minutos e rodadas |
| `GET api/championship/{id}` | Devolve formato, rodada atual e se tem torneio rodando |
| `api/deck` | Aceita e devolve `arquetipoId` |
| `POST/PUT api/timers` | `deCampeonato: true` → liga ao campeonato do dia (se houver dois, devolve a lista pra escolher) |
| `GET api/profile/{userId}` | Pokémon favorito e resumo da liga |
| `PUT api/user/me` | Grava o Pokémon favorito |

### Tempo real — `TorneioHub` em `/hubs/torneio`
Grupo `Torneio_{id}`, que aceita visitante (telão da loja sem login). Eventos: `RodadaGerada`,
`PartidaAtualizada`, `ClassificacaoAtualizada`, `TimerAtualizado`, `TorneioEncerrado`.
O `ComandaHub` não é tocado. O widget de timer do admin continua no polling de 5 s que já tem; o celular
do jogador recebe o timer pelo hub.

---

## 6. Front

| Tela | Rota | Novo/existente |
|---|---|---|
| Hub da liga: semana/mês/ano, campeões, decks | `/liga` | Existente, ganha abas |
| Jogar: código → deck → minha mesa → lançar | `/liga/jogar` | Nova, feita pro celular |
| Telão do torneio (classificação + mesas + timer) | `/liga/torneio/[id]` | Nova, pública |
| Perfil público com estatísticas | `/perfil/[id]` | Existente, ganha bloco da liga |
| Painel do organizador | `/admin/campeonatos/[id]/torneio` | Nova (fora do `campeonatos/page.tsx`, que já tem 1.223 linhas) |
| Timer com "É de campeonato?" | `/admin/timer` | Existente |
| Arquétipo no deck | `/cliente/decks` | Existente |
| Lista de arquétipos | `/admin/liga-mensal` | Existente, aba nova |

Chamadas em `frontend/lib/api/liga.ts` (`torneioApi`, `ligaApi`), seguindo a divisão por assunto.
O cliente SignalR (`lib/signalr.ts`) ganha uma segunda conexão para `/hubs/torneio`.

---

## 7. Segurança

- Código de 5 caracteres sem letras ambíguas (sem 0/O/1/I), único entre torneios ativos, e
  `api/torneios/entrar` no limitador de tentativas que já existe (o mesmo do login).
- Resultado só pode ser lançado pelos dois jogadores da partida e só com a rodada aberta; o organizador
  pode tudo.
- Público vê nome e Pokémon; nada de contato. O perfil público já segue essa regra.
- Permissões: no servidor é `AdminOnly` (admin + operador), como o resto de campeonato; no menu, a
  permissão `campeonatos` que já existe.
- Sem coleta de idade (muitos jogadores são menores; LGPD art. 14).

---

## 8. Fases

1. **Torneio rodando:** banco, `Suico` com testes, `TorneioService`, APIs do organizador e do jogador,
   hub, timer vinculado, `/liga/jogar`, telão e painel do organizador. O encerramento alimenta a Liga Mensal.
2. **Estatísticas:** `LigaEstatisticasService`, abas de semana/mês/ano, campeões, decks, perfil com V/E/D,
   arquétipos e Pokémon favorito.
3. **Enfeites:** animação de vitória, imagem da classificação para postar, aviso de rodada no WhatsApp
   (`IWhatsAppGateway`).

Torneios antigos só têm colocação: entram nos rankings por período, mas não em V/E/D nem em % de vitória.
