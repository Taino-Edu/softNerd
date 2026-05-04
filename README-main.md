# softNerd — CardGameStore

Sistema de gestão para loja de card games (TCG). Gerencia comandas de mesa via QR Code, campeonatos e estoque em uma única plataforma web.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | ASP.NET Core 8 (C#), Entity Framework Core |
| Banco de dados | PostgreSQL 16 (produção) / SQLite (dev local) |
| Cache TCG | MongoDB 7 |
| Tempo real | SignalR (WebSockets) |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Infra | Docker Compose |

---

## Como rodar

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/softNerd.git
cd softNerd
```

### 2. Suba os containers
```bash
docker compose up --build
```

| Serviço | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| API (Swagger) | http://localhost:5000/swagger |

---

## Funcionalidades

- **Comandas via QR Code** — cliente escaneia, faz login com CPF + WhatsApp e aciona sua comanda
- **Venda Avulsa** — admin vende diretamente no balcão sem login do cliente
- **Campeonatos TCG** — criação e inscrição em torneios
- **Estoque** — controle de produtos com alertas de estoque mínimo
- **Dashboard em tempo real** — painel admin com SignalR

---

## Estrutura

```
softNerd/
├── CardGameStore/     ← API ASP.NET Core 8
├── frontend/          ← Next.js 14
└── docker-compose.yml ← Orquestração
```

---

> Para a versão mais recente em desenvolvimento, veja a branch `dev`.

## Licença

Projeto privado — softNerd © 2025
