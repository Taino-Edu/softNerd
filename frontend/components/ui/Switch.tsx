'use client'
// Botão de liga/desliga único do sistema. Antes cada tela tinha o seu feito à mão,
// e dois defeitos se repetiam:
//  - bolinha sem left/top fixos: dentro de <button> ela seguia o alinhamento
//    central do conteúdo e escapava do trilho quando ligada;
//  - trilho desligado em surface-600: no tema claro fica quase branco, igual à
//    bolinha, e o botão parecia ter sumido.
// Aqui as medidas são fixas (trilho 44×24, bolinha 20, folga 2) e o desligado
// usa um cinza que contrasta nos dois temas.

import clsx from 'clsx'

const CORES = {
  verde:  'bg-green-500',
  marca:  'bg-brand-500',
  amarelo:'bg-yellow-500',
  roxo:   'bg-purple-500',
} as const

export function Switch({
  ligado, onChange, label, cor = 'verde', disabled = false, className,
}: {
  ligado: boolean
  onChange: (v: boolean) => void
  /** Nome lido pelo leitor de tela (o texto visível fica fora do botão). */
  label: string
  cor?: keyof typeof CORES
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={clsx(
        'relative inline-block w-11 h-6 p-0 rounded-full shrink-0 transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        ligado ? CORES[cor] : 'bg-gray-400/60',
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
          ligado ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
