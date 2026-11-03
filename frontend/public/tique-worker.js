// Tique do relógio da rodada (contexts/TimerContext.tsx), a cada 250 ms: o alarme toca no máximo
// um quarto de segundo depois do fim (com tique de 1 s, era até 1 s).
// Roda num Web Worker porque o Chrome freia os relógios da aba em segundo plano: com o painel
// numa aba de trás ou minimizado, o setInterval da página passava a rodar uma vez por minuto e
// o alarme do fim da rodada tocava até 1 min atrasado (Maikon, 03/11). Worker não sofre esse freio.
setInterval(function () { postMessage(0) }, 250)
