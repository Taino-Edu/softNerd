// voarParaSacola — a foto do produto "voa" até a Sacola do menu quando o cliente põe o item nela
// (pedido do Maikon, 16/11: uma animação só, na hora de pôr no carrinho; nada de site cheio de efeito).
//
//   voarParaSacola(imgRef.current)
//
// A Sacola do menu (components/loja/MenuLoja) é marcada com data-sacola. Se o menu estiver escondido
// (some ao rolar pra baixo), o evento "loja:sacola" faz ele voltar e a foto voa até onde ele fica.
// Quem pede menos movimento no sistema (prefers-reduced-motion) vê só a Sacola dar um pulinho.

export const EVENTO_SACOLA = 'loja:sacola'

export function voarParaSacola(origem: Element | null | undefined) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENTO_SACOLA))

  const alvo = document.querySelector<HTMLElement>('[data-sacola]')
  if (!alvo) return
  const pular = () => alvo.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'ease-out' })

  const img = origem instanceof HTMLImageElement ? origem : origem?.querySelector('img')
  if (!img || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { pular(); return }

  const de = img.getBoundingClientRect()
  const para = alvo.getBoundingClientRect()
  // Menu escondido: a barra está deslocada pra cima (transform). Desconta pra mirar onde ela volta a ficar.
  const barra = alvo.closest('nav')
  const desloc = barra ? new DOMMatrixReadOnly(getComputedStyle(barra).transform).m42 : 0
  const dx = para.left + para.width / 2 - (de.left + de.width / 2)
  const dy = para.top - desloc + para.height / 2 - (de.top + de.height / 2)

  const foto = img.cloneNode() as HTMLImageElement
  foto.removeAttribute('loading')
  Object.assign(foto.style, {
    position: 'fixed', left: `${de.left}px`, top: `${de.top}px`, width: `${de.width}px`, height: `${de.height}px`,
    margin: '0', padding: '0', objectFit: 'contain', zIndex: '70', pointerEvents: 'none',
    borderRadius: '16px', boxShadow: '0 18px 40px -12px rgba(15,27,51,0.45)', backgroundColor: '#FFFFFF',
  })
  document.body.appendChild(foto)
  const voo = foto.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 40}px) scale(0.55)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.4 },
  ], { duration: 700, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' })
  voo.onfinish = () => { foto.remove(); pular() }
  voo.oncancel = () => foto.remove()
}
