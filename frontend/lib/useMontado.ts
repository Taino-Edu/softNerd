// useMontado — false no servidor e no 1º render do navegador, true depois de montar.
//
// Tudo que vem de cookie/localStorage (perfil, nome, permissões, tema) só existe no
// navegador. Ler isso durante o render faz o HTML do servidor sair diferente do
// navegador e o React joga a página inteira fora ("Hydration failed"). Use assim:
//   const montado = useMontado()
//   const role = montado ? getRole() : ''
'use client'

import { useEffect, useState } from 'react'

export function useMontado(): boolean {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  return montado
}
