# Santuário Nerd — Sistema de Gestão para Loja de Card Games

> Plataforma completa para gerenciamento de lojas de card games (Pokémon, Magic: The Gathering, Yu-Gi-Oh! e outros). Painel administrativo moderno, frente de caixa, comandas por QR Code, crediário, assistente IA e conformidade LGPD.

**Produção:** [santuarionerd.com.br](https://santuarionerd.com.br) — o antigo `santuarionerd.tech` redireciona (301) para cá.

---

## Funcionalidades

### Frente de Caixa (Venda Avulsa)
- Venda direta no balcão sem QR Code
- Catálogo com busca por nome, categoria e código de barras
- Carrinho com controle de estoque em tempo real
- Desconto percentual por venda
- Múltiplas formas de pagamento: Pix, Dinheiro, Cartão Crédito/Débito, Crediário, Pontos, Cashback
- Geração de comprovante para impressão térmica (80mm) e PDF
- Histórico navegável por qualquer data com popup de detalhes

### Comandas por QR Code
- Clientes escaneiam QR Code na mesa e abrem comanda pelo celular
- Login rápido por CPF + WhatsApp com consentimento LGPD integrado
- Dashboard ao vivo com SignalR — novas comandas aparecem sem recarregar
- Admin pode adicionar itens, fechar (com seleção de pagamento) ou cancelar comandas
- Leitor de código de barras via câmera ou USB no painel admin
- Saldo de pontos e cashback do cliente exibido na modal de fechamento (bloqueia se insuficiente)
- Cliente pode aplicar e remover pontos de fidelidade antes do fechamento
- Desconto de pontos aplicados deduzido do `TotalInCents` no fechamento (analytics corretos)

### Crediário
- Criação automática ao fechar comanda/venda no crédito
- Acumula dívidas em aberto por cliente
- Registro de pagamentos parciais com histórico
- Relatório de inadimplência

### Estoque e Produtos
- Cadastro de cards com integração às APIs: Pokémon TCG, Magic (Scryfall) e Yu-Gi-Oh!
- Busca automática de imagens e metadados via APIs externas
- Upload de imagens (JPEG/PNG/WebP, máx 5 MB)
- Alertas de estoque baixo
- Categorias customizáveis

### Campeonatos
- Cadastro com imagem de capa, jogo (texto livre), data, vagas e prêmio
- Inscrições com controle de vagas
- Listagem pública e painel admin

### Relatórios Financeiros
- Dashboard com receita, custo e margem por período
- Gráfico de barras diário
- Breakdown por forma de pagamento com drill-down de transações
- Filtros por data, cliente e faixa de valor
- Exportação em PDF

### Assistente IA
- Chat flutuante no painel admin alimentado pelo **Google Gemini 2.5 Flash**
- Contexto automático do negócio (comandas, estoque, crediário)
- Sugestões rápidas de perguntas

### Área do Cliente
- Histórico de comandas com detalhamento de itens
- Saldo de pontos de fidelidade e cashback/crédito na loja
- Perfil editável com upload de foto (JPEG/PNG/WebP, máx 5 MB)
- ThemeToggle (modo claro/escuro persistido)
- Modo RPG — comanda exibida como "pergaminho" temático
- Histórico de campeonatos e inscrições

### Gestão Administrativa
- Gestão de usuários com funções (Admin / Customer)
- Pontos de fidelidade e saldo cashback por cliente
- Inscrição manual de clientes em campeonatos; remoção de participantes
- Nova dívida (crediário) com lista de itens e cálculo automático do total
- Anúncios e promoções
- Geração de QR Codes para mesas
- Painel LGPD para resposta de solicitações de titulares

### Conformidade LGPD
- Formulário público `/lgpd` com validação de CPF (Módulo 11)
- Audit log imutável com IP anonimizado (SHA-256)
- Política de Privacidade e Termos de Uso
- Painel admin para gestão de solicitações dentro do prazo legal

---

## Stack Tecnológico

### Backend — `CardGameStore/`

| Tecnologia | Finalidade |
|---|---|
| ASP.NET Core 8 | API REST |
| Entity Framework Core 8 | ORM — PostgreSQL (sem migrations automáticas) |
| PostgreSQL 16 | Usuários, produtos, comandas, crediários, campeonatos |
| MongoDB 7 | Vendas avulsas (event store imutável) |
| SignalR | Tempo real — comandas ao vivo |
| JWT (HttpOnly Cookies) | Autenticação stateless |
| BCrypt.Net | Hash de senhas |
| Google Gemini 2.5 Flash | Assistente IA (HTTP direto, sem SDK) |
| xUnit + Moq + FluentAssertions | Testes unitários |

### Frontend — `frontend/`

| Tecnologia | Finalidade |
|---|---|
| Next.js 14 (App Router) | Framework React SSR |
| TypeScript 5 | Tipagem estática |
| Tailwind CSS 3 | Estilização |
| Axios | Chamadas HTTP com interceptors de refresh token |
| @microsoft/signalr | Cliente SignalR |
| lucide-react | Ícones |
| react-hot-toast | Notificações |
| clsx | Classes condicionais |

### Infraestrutura

| Tecnologia | Finalidade |
|---|---|
| Docker + Docker Compose | Containerização |
| Nginx 1.27 Alpine | Proxy reverso — porta 80 |
| Hostinger VPS (Ubuntu 24.04, 4 GB RAM) | Servidor de produção |
| Cloudflare | DNS + SSL/TLS (HTTPS) |

---

## Estrutura do Projeto

```
softNerd/
├── CardGameStore/              # ASP.NET Core 8 — API REST
│   ├── Controllers/            # Endpoints (Auth, Product, Comanda, Venda, Upload, ...)
│   ├── Services/               # Lógica de negócio
│   ├── Models/
│   │   ├── PostgreSQL/         # Entidades EF Core
│   │   └── MongoDB/            # Documentos (VendaAvulsa)
│   ├── DTOs/                   # Requests e responses
│   ├── Data/                   # AppDbContext
│   └── Dockerfile
│
├── frontend/                   # Next.js 14 App Router
│   ├── app/
│   │   ├── admin/              # Painel administrativo
│   │   │   ├── dashboard/      # Comandas ao vivo
│   │   │   ├── venda-avulsa/   # Frente de caixa
│   │   │   ├── crediario/      # Gestão de crediário
│   │   │   ├── estoque/        # Produtos e estoque
│   │   │   ├── campeonatos/    # Gestão de campeonatos
│   │   │   ├── financeiro/     # Relatórios
│   │   │   ├── usuarios/       # Gestão de clientes
│   │   │   ├── anuncios/       # Anúncios e promoções
│   │   │   ├── qrcodes/        # QR Codes de mesas
│   │   │   └── lgpd/           # Painel LGPD
│   │   ├── cliente/            # Área do cliente logado
│   │   ├── mesa/[mesa]/        # Login por QR Code
│   │   ├── lgpd/               # Formulário público LGPD
│   │   ├── privacidade/        # Política de Privacidade
│   │   └── termos/             # Termos de Uso
│   ├── components/
│   │   └── admin/
│   │       └── AiChatWidget.tsx  # Chat IA flutuante
│   ├── lib/
│   │   ├── api.ts              # Todos os endpoints tipados
│   │   ├── auth.ts             # Gestão de sessão
│   │   └── signalr.ts          # Hub de tempo real
│   └── Dockerfile
│
├── tests/
│   ├── api/                    # Testes de endpoints (.http — REST Client)
│   └── unit/                   # Testes unitários xUnit (10 serviços)
│
├── deploy/
│   ├── docker-compose.prod.yml # Stack de produção completa
│   ├── nginx/nginx.conf        # Configuração do proxy reverso
│   ├── setup.sh                # Instalação automática no VPS
│   ├── update.sh               # Atualização (git pull + rebuild)
│   └── cleanup.sh              # Limpeza segura de espaço em disco
│
├── softNerd.sln                # Solução Visual Studio
├── run-tests.ps1               # Runner de testes unitários
└── .gitignore
```

---

## Deploy em Produção

### Primeira instalação no VPS

```bash
curl -fsSL https://raw.githubusercontent.com/Taino-Edu/softNerd/main/deploy/setup.sh | bash
```

O script instala Docker, configura o firewall (UFW), clona o repositório, gera segredos e sobe os containers.

### Atualizar após novo commit

```bash
bash /opt/santuarionerd/deploy/update.sh
```

Ou manualmente:

```bash
cd /opt/santuarionerd
git pull
docker compose -f deploy/docker-compose.prod.yml build api frontend
docker compose -f deploy/docker-compose.prod.yml up -d
```

### Limpar espaço em disco (build cache acumula rápido)

```bash
bash /opt/santuarionerd/deploy/cleanup.sh
```

---

## Variáveis de Ambiente

Copie `deploy/.env.example` para `/opt/santuarionerd/.env` e preencha:

```env
# PostgreSQL
POSTGRES_DB=cardgamestore
POSTGRES_USER=cardgame_user
POSTGRES_PASSWORD=<gerado pelo setup.sh>

# JWT (não altere após o primeiro deploy)
JWT_SECRET=<gerado pelo setup.sh>

# E-mail via Resend
SMTP_PASSWORD=<API Key do resend.com>

# Google Gemini IA
GEMINI_API_KEY=<chave do Google AI Studio>

# Segurança
IP_HASH_SALT=<gerado pelo setup.sh>

# Senha do admin inicial (opcional — só tem efeito no PRIMEIRO boot com banco vazio)
# Se omitido, usa "SenhaForte@123" e emite LogWarning
ADMIN_SEED_PASSWORD=<senha forte para o admin inicial>
```

---

## Testes

### Unitários (xUnit)

```bash
# Windows
.\run-tests.ps1

# Linux/macOS
dotnet test tests/unit/CardGameStore.Tests/CardGameStore.Tests.csproj
```

Cobertura: 134 testes unitários, 100% aprovados. Serviços: Auth, Product, Comanda, VendaAvulsa, Crediário, Championship, User, Announcement, Audit, LGPD.

### E2E (Playwright)

```bash
cd frontend
npx playwright test
```

Infraestrutura de testes E2E configurada em `frontend/tests/`.

### API (.http files — REST Client)

Abra os arquivos em `tests/api/` com a extensão **REST Client** no VS Code.  
Configure as variáveis em `tests/api/http-client.env.json`.

---

## Principais Endpoints

### Autenticação
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Login — define cookies HttpOnly |
| `POST` | `/api/auth/refresh` | Renova accessToken |
| `POST` | `/api/auth/logout` | Encerra sessão |
| `POST` | `/api/auth/quick-login` | Login via QR Code (mesa) |

### Produtos
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/product` | Lista produtos com filtros |
| `POST` | `/api/product` | Cria produto |
| `PUT` | `/api/product/{id}` | Atualiza produto |
| `DELETE` | `/api/product/{id}` | Desativa produto |
| `GET` | `/api/product/barcode/{code}` | Busca por código de barras |
| `GET` | `/api/product/low-stock` | Produtos com estoque baixo |

### Comandas
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/comanda/dashboard` | Comandas ativas (tempo real) |
| `POST` | `/api/comanda/{id}/items` | Adiciona item |
| `DELETE` | `/api/comanda/{id}/items/{itemId}` | Remove item |
| `PUT` | `/api/comanda/{id}/close` | Fecha comanda |
| `PUT` | `/api/comanda/{id}/cancel` | Cancela comanda |
| `POST` | `/api/comanda/{id}/apply-points` | Aplica pontos de fidelidade |
| `DELETE` | `/api/comanda/{id}/apply-points` | Remove pontos aplicados |

### Venda Avulsa
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/venda-avulsa` | Registra venda no balcão |
| `GET` | `/api/venda-avulsa/recent` | Últimas N vendas |
| `GET` | `/api/venda-avulsa/by-date?date=YYYY-MM-DD` | Vendas de um dia específico |

### Crediário
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/crediario` | Lista crediários com filtros |
| `POST` | `/api/crediario` | Cria crediário manual |
| `POST` | `/api/crediario/{id}/pagamento` | Registra pagamento |

### Campeonatos
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/championship` | Lista campeonatos públicos |
| `GET` | `/api/championship/admin/all` | Lista todos (admin, com busca) |
| `POST` | `/api/championship` | Cria campeonato |
| `PUT` | `/api/championship/{id}/image` | Define imagem de capa |
| `DELETE` | `/api/championship/{id}` | Remove campeonato finalizado/cancelado |
| `POST` | `/api/championship/{id}/admin-register` | Inscreve cliente manualmente |
| `DELETE` | `/api/championship/{id}/participants/{pid}` | Remove participante |

### Upload
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/upload/image` | Upload de imagem de produto (máx 5 MB) |
| `POST` | `/api/upload/profile-image` | Upload de foto de perfil do usuário (máx 5 MB) |

### IA
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/ai/chat` | Chat com Gemini 2.5 Flash |

---

## Segurança

| Medida | Implementação |
|---|---|
| Autenticação | JWT em HttpOnly Cookies (tokens nunca expostos no body JSON) |
| Senhas | BCrypt com salt aleatório; admin seed via `ADMIN_SEED_PASSWORD` |
| CSRF | SameSite=Lax |
| Rate Limiting | GlobalLimiter 300 req/min por IP; políticas "auth" (5/min) e "api" (200/min) |
| Content-Security-Policy | `default-src 'none'; frame-ancestors 'none'` |
| SQL Injection | EF Core (queries parametrizadas) |
| HTML Injection | `HtmlEncoder.Default.Encode()` em campos livres enviados por e-mail |
| IP em logs | Anonimizado via SHA-256 |
| HTTPS | Forçado via Cloudflare + `COOKIE_SECURE=true` |
| Proxy reverso | `UseForwardedHeaders` + `X-Forwarded-For` |
| Claims nulas | `Guid.TryParse` em todos os controllers — nunca null-forgiving operator |

---

## Licença

Software proprietário e confidencial. Todos os direitos reservados.  
Consulte [LICENSE](./LICENSE) para os termos completos.

---

*Santuário Nerd — Gestão inteligente para lojas de card games.*
