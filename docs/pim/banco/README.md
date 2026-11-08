# Banco de dados — PIM IV, etapa 7 (Programação de Banco de Dados)

Documentação do banco do **Santuário Nerd**, gerada **a partir do PostgreSQL real** pelo script `scripts/gerar-modelo-dados.py`.

## O que tem aqui

| Arquivo | O que é | Pedido no manual |
|---|---|---|
| [`mer-conceitual.md`](mer-conceitual.md) | MER conceitual por domínio (entidades de negócio e relacionamentos) | MER |
| [`modelo-logico.md`](modelo-logico.md) | Modelo lógico: tabelas, colunas, PK/FK/UK, decisões de modelagem, relações sem FK | Modelo lógico |
| [`dicionario-de-dados.md`](dicionario-de-dados.md) | Uma seção por tabela, com todas as colunas e índices | Apoio ao lógico/físico |
| [`procedures-triggers.md`](procedures-triggers.md) | Procedures, funções e triggers: o que fazem, onde ficam, como testar e reverter | Procedures e triggers |
| [`schema.sql`](schema.sql) | Script físico completo (estrutura) | Script do banco |
| `mmd/*.mmd` | Fonte Mermaid de cada diagrama | — |
| `img/*.svg`, `img/*.png` | Diagramas renderizados, prontos pro trabalho escrito (ABNT) | — |

## Números do banco (conferidos no schema)

- **40 tabelas** em 7 domínios, **476 colunas**
- **40 chaves primárias**, **37 chaves estrangeiras** declaradas, **126 índices** (54 únicos, 12 parciais)
- PostgreSQL 16 (dados relacionais) + MongoDB (vendas do caixa e cache de cartas, fora deste schema)

## Procedures e triggers

O banco tem **6 funções/procedures** e **14 triggers** próprios, criados pelo bloco final de `CardGameStore/Data/Inicializacao/postgres.sql` (idempotente, roda a cada partida). Detalhes, regras e como testar em [`procedures-triggers.md`](procedures-triggers.md).

## Como regenerar

```bash
# precisa do banco local no ar (podman start softnerd_postgres_dev) com a API já rodada uma vez pra criar o schema
python3 scripts/gerar-modelo-dados.py
# imagens: os .mmd abrem em https://mermaid.js.org; os SVG/PNG de img/ foram renderizados com Mermaid 11.4.1
```
