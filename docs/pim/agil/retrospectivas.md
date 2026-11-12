# Retrospectivas reconstruídas

> O projeto não tinha reuniões de retrospectiva. Estas cinco foram **reconstruídas a partir de eventos reais** do histórico (CHANGELOG, PRs e
> incidentes), no formato *contexto → o que aconteceu → lição → ação*. O grupo deve revisar e ajustar o texto antes de entregar.

## R1 — Venda perdida por um clique fora (sprints 14 e 18)

- **Contexto:** a frente de caixa abria um modal de "Nova Venda"; clicar fora fechava e apagava o carrinho, e o Maikon perdia a venda no meio.
- **O que aconteceu:** na sprint 14 (v1.29.0) o clique fora passou a **não fechar** o modal. Na sprint 18 (v1.85.0), testando o fluxo no celular, viu-se que isso trouxe outros problemas (Esc não fechava; botão de confirmar escondido no celular).
- **Lição:** bloquear a ação resolve o sintoma; **guardar o estado** resolve a causa. O rascunho (carrinho, pagamento e desconto) sobrevive a fechar e até a recarregar a página.
- **Ação:** o padrão de rascunho (`useRascunho`) passa a valer para os modais de venda; os demais modais do painel ficam como próximo item.

## R2 — Ritmo alto pede rede de segurança (sprints 16 e 17)

- **Contexto:** as versões por sprint subiram de 11 (sprint 9) para 22 (sprint 16) e depois 47 (sprint 17), com o cliente pedindo ajustes toda semana.
- **O que aconteceu:** na sprint 16 (v1.41.0) nasceu a tela **Mudanças com volta**: toda mudança grande entra atrás de uma chave de funcionalidade, com o jeito antigo guardado. 16 versões foram entregues assim.
- **Lição:** velocidade sem possibilidade de reverter vira risco para o cliente real. Reverter sem novo deploy reduz o medo de entregar.
- **Ação:** manter a regra "mudança grande: sempre com volta"; remover o jeito antigo só depois que o cliente validar (feito na sprint 18: v1.75.0 a v1.77.0).

## R3 — Pagar a dívida técnica (sprint 18)

- **Contexto:** acumularam-se funcionalidades que a loja não usava (NFC-e, WhatsApp automático, conciliação de extrato) e controllers que falavam direto com o banco.
- **O que aconteceu:** NFC-e e Tenant-ERP saíram na v1.71.0, WhatsApp automático e módulos sem uso na v1.73.0; pedidos, campeonatos e crediário foram reorganizados em camadas (v1.78.0 a v1.80.0). O número de endpoints caiu de 286 para 252.
- **Lição:** remover código é entrega. O sistema ficou menor, mais fácil de explicar e de testar.
- **Ação:** continuar com os controllers restantes (`AnalyticsController`, `UserController`, `LgpdController`) e com a retirada do MongoDB, sempre com volta.

## R4 — O bug que o teste automatizado não pegou (sprint 18)

- **Contexto:** o Maikon relatava que "o sistema cai com comanda aberta durante o campeonato". Os logs de cinco dias mostravam o servidor sem queda e o problema não reproduzia no ambiente local.
- **O que aconteceu:** testando de ponta a ponta com navegação entre telas, achou-se uma **corrida na conexão em tempo real**: ao trocar de tela a conexão era derrubada e a tela nova ficava ouvindo uma conexão morta, com o aviso "Conectado" ainda na tela. Corrigido na v1.84.1, com rede de segurança (recarregar sozinho se a conexão cair).
- **Lição:** o servidor estava certo; o defeito era do cliente web. Só apareceu com o **teste em tela, em fluxo real**, repetindo o que o operador faz o dia inteiro.
- **Ação:** testes ao vivo em celular e desktop passam a ser parte da definição de pronto de mudanças de tela; o app Android também foi testado em aparelho real.

## R5 — Pull request empilhado no lugar errado (sprint 18)

- **Contexto:** o PR #155 foi aberto "empilhado" sobre a branch do PR #154 (para o diff ficar só com o novo).
- **O que aconteceu:** os dois foram mergeados 14 segundos um do outro; o #155 caiu **na branch do #154** em vez de na `main`, e as mudanças não chegaram à produção. Foi percebido ao conferir o estado do `main` e reaplicado como PR #156.
- **Lição:** PR empilhado confunde quem merge e o GitHub só reaponta a base depois que o pai entra. Conferir a **base** do PR antes de mergear evita o susto.
- **Ação:** abrir cada PR direto para a `main`; depois de mergear, conferir o `git log` do `main`.

## Para a próxima sprint

| Manter | Começar | Parar |
|---|---|---|
| entrega pequena e frequente; cliente no circuito; mudança com volta | testar no celular antes de abrir o PR; documentar cada pacote entregue | empilhar PRs; deixar decisão do cliente parada sem registrar em "Esperando alguém" |
