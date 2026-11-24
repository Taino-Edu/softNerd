import type { ComandaDto } from '@/lib/api'
import { brl, brlDeCentavos } from '@/lib/format'

export default function ComandaResumo({ comanda, desconto = 0 }: { comanda: ComandaDto; desconto?: number }) {
  const quantidade = comanda.items.reduce((soma, item) => soma + item.quantity, 0)
  const total = Math.max(0, comanda.totalInReais - (comanda.pointsApplied + desconto) / 100)
  return (
    <section aria-label="Resumo da comanda" className="min-w-0 rounded-xl border bg-[var(--bg-card)]">
      <div className="border-b px-4 py-3">
        <h2 className="font-black">Itens da comanda <span className="text-sm text-[var(--text-muted)]">({quantidade})</span></h2>
      </div>
      {comanda.items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-[var(--text-muted)]">Adicione produtos para montar a comanda.</p>
      ) : (
        <ul className="max-h-[42dvh] divide-y overflow-y-auto px-4">
          {comanda.items.map(item => (
            <li key={item.id} className="flex items-start justify-between gap-2 py-3 text-sm">
              <span className="min-w-0 break-words"><strong>{item.quantity}×</strong> {item.itemNameSnapshot}</span>
              <strong className="shrink-0 tabular-nums">{brl(item.subtotalInReais)}</strong>
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-1 border-t px-4 py-3 text-sm">
        {(comanda.pointsApplied > 0 || desconto > 0) && (
          <div className="flex justify-between gap-2 text-[var(--text-muted)]"><dt>Subtotal</dt><dd>{brl(comanda.totalInReais)}</dd></div>
        )}
        {comanda.pointsApplied > 0 && (
          <div className="txt-ok flex justify-between gap-2"><dt>Pontos aplicados</dt><dd>−{brlDeCentavos(comanda.pointsApplied)}</dd></div>
        )}
        {desconto > 0 && (
          <div className="txt-ok flex justify-between gap-2"><dt>Desconto</dt><dd>−{brlDeCentavos(desconto)}</dd></div>
        )}
        <div className="flex items-baseline justify-between gap-2 font-black">
          <dt>Total da comanda</dt><dd aria-live="polite" className="text-xl tabular-nums">{brl(total)}</dd>
        </div>
      </dl>
    </section>
  )
}
