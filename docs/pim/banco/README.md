# Banco de dados — PIM IV, etapa 7 (Programação de Banco de Dados)

Documentação do banco do **Santuário Nerd**, gerada **a partir do PostgreSQL real** pelo script `scripts/gerar-modelo-dados.py`.

## O que tem aqui

| Arquivo | O que é | Pedido no manual |
|---|---|---|
| [`mer-conceitual.md`](mer-conceitual.md) | MER conceitual por domínio (entidades de negócio e relacionamentos) | MER |
| [`modelo-logico.md`](modelo-logico.md) | Modelo lógico: tabelas, colunas, PK/FK/UK, decisões de modelagem, relações sem FK | Modelo lógico |
| [`dicionario-de-dados.md`](dicionario-de-dados.md) | Uma seção por tabela, com todas as colunas e índices | Apoio ao lógico/físico |
| [`schema.sql`](schema.sql) | Script físico completo (estrutura) | Script do banco |
| `mmd/*.mmd` | Fonte Mermaid de cada diagrama | — |
| `img/*.svg`, `img/*.png` | Diagramas renderizados, prontos pro trabalho escrito (ABNT) | — |

## Números do banco (conferidos no schema)

- **39 tabelas** em 7 domínios, **468 colunas**
- **39 chaves primárias**, **37 chaves estrangeiras** declaradas, **123 índices** (54 únicos, 12 parciais)
- PostgreSQL 16 (dados relacionais) + MongoDB (vendas do caixa e cache de cartas, fora deste schema)

## Procedures e triggers

Hoje o banco tem **0 procedures e 0 triggers**: toda regra de negócio mora na aplicação (C#). O manual do PIM pede os dois; o plano de como incluí-los sem arriscar o sistema em produção está em `docs/pim/ANALISE-PIM-IV.md` (etapa 7). Este pacote cobre o MER, o modelo lógico e o script físico.

## Como regenerar

```bash
# precisa do banco local no ar (podman start softnerd_postgres_dev) com a API já rodada uma vez pra criar o schema
python3 scripts/gerar-modelo-dados.py
# imagens: os .mmd abrem em https://mermaid.js.org; os SVG/PNG de img/ foram renderizados com Mermaid 11.4.1
```
