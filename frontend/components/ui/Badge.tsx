import { ReactNode } from 'react'
import clsx from 'clsx'

export type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASSES: Record<BadgeTone, string> = {
  info:    'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  success: 'bg-accent-green/20 text-accent-green border border-accent-green/30',
  warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  danger:  'bg-accent-red/20 text-accent-red border border-accent-red/30',
  neutral: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

interface BadgeProps {
  tone: BadgeTone
  children: ReactNode
  className?: string
}

/** Pílula de status padrão — mesma classe `.badge` (globals.css) usada por
 * `.badge-aberta` etc., só que com o tom escolhido pela página em vez de um
 * nome fixo. Cada domínio (fiscal, contas a receber, pré-venda...) mapeia seu
 * próprio status pro tone mais próximo. */
export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <span className={clsx('badge', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  )
}
