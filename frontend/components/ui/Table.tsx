import { ReactNode } from 'react'
import clsx from 'clsx'

interface TableProps {
  children: ReactNode
  className?: string
  minWidth?: string
}

/** Wrapper de tabela padrão — mesma composição já usada (e correta) em
 * estoque/page.tsx: `card p-0 overflow-hidden` > scroll horizontal > table.
 * Existe pra fixar o token de borda certo (surface-500) num só lugar, em vez
 * de cada página escolher entre surface-500/600/700 na mão (foi assim que o
 * financeiro acabou com duas tabelas com bordas diferentes na mesma página). */
export function Table({ children, className, minWidth }: TableProps) {
  return (
    <div className={clsx('card p-0 overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className={clsx('w-full text-sm', minWidth)}>{children}</table>
      </div>
    </div>
  )
}

Table.Head = function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={clsx('bg-surface-800 border-b border-surface-500', className)}>{children}</thead>
}

Table.Body = function TableBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={clsx('divide-y divide-surface-500', className)}>{children}</tbody>
}
