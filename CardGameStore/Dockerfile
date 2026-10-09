# =============================================================================
# Dockerfile — Build multi-stage para produção
# Stage 1: build com SDK  |  Stage 2: runtime mínimo (sem SDK)
# =============================================================================

# ---- STAGE 1: BUILD ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copia apenas o .csproj primeiro — camada em cache enquanto dependências não mudarem
COPY CardGameStore.csproj .
RUN dotnet restore

# Copia o restante e publica em modo Release
# Nota: --no-restore omitido intencionalmente — garante resolve correto de pacotes
# mesmo quando a camada de restore está em cache com versão anterior do .csproj
COPY . .
RUN dotnet publish -c Release -o /app/publish

# ---- STAGE 2: RUNTIME ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl é necessário para o healthcheck do docker-compose; openssl para verificar
# o provider legacy no build (abaixo)
RUN apt-get update && apt-get install -y --no-install-recommends curl openssl && rm -rf /var/lib/apt/lists/*

# Habilita o provider "legacy" do OpenSSL 3 — certificados A1 ICP-Brasil (.pfx)
# costumam ser empacotados com PBE antigo (RC2/3DES), que o OpenSSL 3 desativa
# por padrão. Sem isso, abrir o .pfx falha como se a senha estivesse errada.
#
# Config autocontido (sem .include do arquivo do sistema — evitava risco de
# seção duplicada e escondia o erro real atrás do pipe). Testado manualmente
# contra esta mesma imagem base em 07/07/2026: providers default+legacy
# carregam e ficam "active". `tee` garante que, se algo mudar e voltar a
# falhar, o erro real do OpenSSL aparece no log do build em vez de sumir
# atrás do grep.
RUN printf '%s\n' \
      'openssl_conf = openssl_init' \
      '' \
      '[openssl_init]' \
      'providers = provider_sect' \
      '' \
      '[provider_sect]' \
      'default = default_sect' \
      'legacy = legacy_sect' \
      '' \
      '[default_sect]' \
      'activate = 1' \
      '' \
      '[legacy_sect]' \
      'activate = 1' \
      > /etc/ssl/openssl-legacy.cnf

ENV OPENSSL_CONF=/etc/ssl/openssl-legacy.cnf

RUN openssl list -providers | tee /dev/stderr | grep -q legacy

COPY --from=build /app/publish .

EXPOSE 5000

# ASPNETCORE_ENVIRONMENT e demais configurações vêm do docker-compose / variáveis de ambiente
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "CardGameStore.dll"]
