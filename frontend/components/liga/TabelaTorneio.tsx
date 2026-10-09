// Tabela de classificação da liguinha (V/E/D/PTS; OWP no telão).

import { LinhaTabela } from '@/lib/api'

export default function TabelaTorneio({ linhas, destaque, grande = false }: { linhas: LinhaTabela[]; destaque?: string | null; grande?: boolean }) {
  return (
    <section className="bg-surface-800 border border-surface-500 rounded-2xl overflow-hidden">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-4 pt-3 pb-2">Classificação</h2>
      <table className={`w-full ${grande ? 'text-lg' : 'text-sm'}`}>
        <thead>
          <tr className="text-xs text-gray-500 border-b border-surface-500">
            <th className="text-left px-4 py-1.5 w-8">#</th>
            <th className="text-left py-1.5">Jogador</th>
            <th className="py-1.5 w-8">V</th><th className="py-1.5 w-8">E</th><th className="py-1.5 w-8">D</th>
            {grande && <th className="py-1.5 w-16 text-right">OWP</th>}
            <th className="px-4 py-1.5 w-10 text-right">PTS</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.participanteId}
              className={`border-b border-surface-500 last:border-0 ${l.participanteId === destaque ? 'bg-surface-700' : ''}`}>
              <td className="px-4 py-2 text-gray-400">{l.posicao}</td>
              <td className={`py-2 text-white truncate ${grande ? '' : 'max-w-[9rem]'}`}>
                {l.nome}{l.desistiuNaRodada ? <span className="text-gray-500 text-xs"> (saiu)</span> : null}
              </td>
              <td className="text-center text-gray-300">{l.vitorias}</td>
              <td className="text-center text-gray-300">{l.empates}</td>
              <td className="text-center text-gray-300">{l.derrotas}</td>
              {grande && <td className="text-right text-gray-400">{l.owp.toFixed(1)}%</td>}
              <td className="px-4 text-right font-semibold text-white">{l.pontos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
