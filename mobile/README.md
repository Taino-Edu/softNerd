# Santuário Liga — app Android do jogador

App Flutter (Android) para quem joga a **Liga e a Liguinha**: entrar no torneio pelo código do telão, fazer
check-in, informar o deck, avisar "estou pronto", acompanhar o relógio da rodada, lançar o resultado e ver a
classificação e o ranking do mês. O site continua sendo o sistema completo; o app é o companheiro do jogador.

Usa **só endpoints que já existem** na API (`/api/auth/client-login`, `/api/torneios/*`, `/api/liga-mensal/*`).
Não mexe no backend.

## Telas

| Tela | O que faz | Endpoints |
|---|---|---|
| Login | e-mail e senha; sessão fica guardada | `POST /api/auth/client-login`, `GET /api/user/me`, `POST /api/auth/refresh` |
| Meus torneios | lista os ativos; entrar com o código | `GET /api/torneios/ativos`, `POST /api/torneios/entrar` |
| Mesa | check-in, deck, estou pronto, relógio, resultado (com confirmação), desistir, classificação; atualiza a cada 8 s | `GET /api/torneios/{id}/minha-mesa`, `POST .../check-in`, `PUT .../meu-deck`, `POST .../pronto`, `POST .../partidas/{id}/resultado`, `POST .../desistir` |
| Liga do mês | ranking do mês escolhido, sua posição em destaque | `GET /api/liga-mensal`, `GET /api/liga-mensal/meses` |
| Conta | nome, sair | `POST /api/auth/logout` |

O login da API usa **cookies HttpOnly**; o app guarda os cookies num `PersistCookieJar` (sobrevivem ao fechar o app)
e renova a sessão sozinho quando ela expira. O relógio da rodada conta pela **hora do servidor**, como o site.

## Rodar em desenvolvimento

Pré-requisitos: Flutter 3.47+, Android SDK (plataforma 36), JDK 21 e um celular com depuração USB.

```bash
cd mobile
flutter pub get
adb reverse tcp:5000 tcp:5000        # "localhost" do celular = o computador (API local em :5000)
flutter run                           # ou: flutter build apk --debug && adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

API em outro endereço (produção/staging): `flutter build apk --release --dart-define=API_URL=https://seu-dominio`.
Em desenvolvimento a API grava cookies sem `Secure` (HTTP local); em produção eles são `Secure` e o app usa HTTPS.

## Estrutura

```
lib/
  main.dart            raiz: abre logado se os cookies ainda valem
  config.dart          URL da API (--dart-define=API_URL)
  api/api.dart         Dio + cookies persistentes + renovação de sessão + erros em português
  models/liga.dart     modelos (espelham frontend/lib/api/liga.ts)
  state/providers.dart Riverpod: sessão, torneios, mesa, Liga
  telas/               login, inicio (abas), mesa, liga, conta
  widgets/estado.dart  carregando / erro com "Tentar de novo"
```

## Testado em aparelho real (Android 16)

Login, sessão após fechar o app, entrar com código (e código inválido), check-in, "estou pronto", relógio rodando,
resultado com confirmação, resultado divergente (aviso para chamar o organizador) e corrigido, folga (bye),
classificação ao vivo, erro de rede com "Tentar de novo", sair da conta.

## Identidade visual

Mesma do site: azul da loja em degradê, amarelo de destaque, fundo azul-claro e a fonte **Nunito** (embarcada em
`assets/fonts`, licença OFL em `assets/fonts/OFL-Nunito.txt`). A logo da nuvem vem de `assets/images`. A foto do jogador é o
**Pokémon preferido** dele (sprites do Pokémon Showdown, igual ao site); sem Pokémon ou sem internet vira a inicial.
Componentes de marca em `lib/widgets/marca.dart` (cabeçalho em degradê, cartão, botão amarelo, pílula, avatar, título de seção).
O toque tem vibração leve (confirmar, check-in, resultado). Ícone e tela de abertura em azul da marca
(`dart run flutter_launcher_icons` regenera o ícone a partir de `assets/images/icone.png`).

## Ainda não tem

Tempo real por SignalR (hoje atualiza por consulta a cada 8 s), notificação, cache offline além do que já está na
memória, tema escuro, versão iOS (o código Dart é o mesmo; falta Mac/conta Apple para compilar e distribuir).
