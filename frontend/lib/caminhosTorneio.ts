// caminhosTorneio — onde mora cada evento suíço (chave "campeonato-separado", v1.68.0)
//
// Pedido do Maikon: Campeonato não pode rodar na página da Liga junto com a liguinha.
// Com a chave ligada, evento de modalidade Campeonato usa /campeonato/jogar e /campeonato/torneio/{id}
// (as mesmas telas, com os nomes e links do campeonato) e a Liguinha só mostra Liga.
// Desligada (ou modalidade Liga): tudo em /liga, como antes.

export type ModalidadeEvento = 'Liga' | 'Campeonato'

export function rotasDoEvento(modalidade: string | null | undefined, separado: boolean) {
  const campeonato = separado && modalidade === 'Campeonato'
  const base = campeonato ? '/campeonato' : '/liga'
  return {
    campeonato,
    /** Tela do jogador (lista ou o torneio, com ?t=id). */
    jogar: `${base}/jogar`,
    telao: (id: string) => `${base}/torneio/${id}`,
    /** "Voltar" do telão: a Liga, ou a página do próprio campeonato. */
    voltar: (id: string) => campeonato ? { href: `/campeonato/${id}`, rotulo: 'Campeonato' } : { href: '/liga', rotulo: 'Liga' },
    nome: campeonato ? 'Campeonato' : 'Liguinha',
  }
}

/** Em qual modalidade a tela atual está, pelo endereço (/campeonato/... ou /liga/...). */
export function modalidadeDoEndereco(pathname: string | null | undefined): ModalidadeEvento {
  return pathname?.startsWith('/campeonato') ? 'Campeonato' : 'Liga'
}
