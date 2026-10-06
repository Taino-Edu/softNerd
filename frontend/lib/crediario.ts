import { ItemCrediarioDto } from './api'

/**
 * Soma as linhas repetidas de uma compra do crediário: seis "1× Coca Cola Lata"
 * viram um "6× Coca Cola Lata". Mesmo produto com preço diferente fica separado
 * (o preço mudou entre uma visita e outra). Mantém a ordem em que cada produto
 * apareceu primeiro.
 */
export function agruparItens(itens: ItemCrediarioDto[]): ItemCrediarioDto[] {
  const porChave = new Map<string, ItemCrediarioDto>()
  for (const i of itens) {
    const chave = `${i.itemName.trim().toLowerCase()}|${i.unitPriceInReais.toFixed(2)}`
    const atual = porChave.get(chave)
    if (atual) {
      atual.quantity        += i.quantity
      atual.subtotalInReais += i.subtotalInReais
    } else {
      porChave.set(chave, { ...i })
    }
  }
  return Array.from(porChave.values())
}

/** Total de unidades (não de linhas) — "60 itens" passa a contar o que o cliente levou. */
export const totalUnidades = (itens: ItemCrediarioDto[]) => itens.reduce((s, i) => s + i.quantity, 0)
