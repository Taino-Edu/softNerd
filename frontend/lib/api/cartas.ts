// lib/api/cartas.ts — Cartas (TCG), decks e vitrine de cartas
// Importe sempre de "@/lib/api" (lib/api/index.ts junta todos).
import { api } from './client'

export interface CardAttack {
  name: string; cost: string[]; convertedEnergyCost: number; damage?: string | null; text?: string | null
}

export interface CardWeakness { type: string; value: string }

export interface CardPriceVariant { low?: number | null; mid?: number | null; high?: number | null; market?: number | null; directLow?: number | null }

export interface CardAllPrices {
  normal?: CardPriceVariant | null
  holofoil?: CardPriceVariant | null
  reverseHolofoil?: CardPriceVariant | null
  firstEditionNormal?: CardPriceVariant | null
  firstEditionHolofoil?: CardPriceVariant | null
  unlimitedNormal?: CardPriceVariant | null
  unlimitedHolofoil?: CardPriceVariant | null
}

export interface CardMarketPrices {
  averageSellPrice?: number | null; lowPrice?: number | null; trendPrice?: number | null
  reverseHoloSell?: number | null; reverseHoloLow?: number | null; reverseHoloTrend?: number | null
  lowPriceExPlus?: number | null
  avg1?: number | null; avg7?: number | null; avg30?: number | null
  reverseHoloAvg1?: number | null; reverseHoloAvg7?: number | null; reverseHoloAvg30?: number | null
  url?: string | null; updatedAt?: string | null
}

export interface CardCache {
  tcgCardId: string; name: string; game: string
  setName: string | null; setCode: string | null; number?: string | null
  setSeries?: string | null; setPtcgoCode?: string | null; setReleaseDate?: string | null
  rarity: string | null; type: string | null
  subtypes: string[]; types: string[]
  hp: string | null; artist: string | null; flavorText: string | null; regulationMark: string | null
  evolvesFrom?: string | null; evolvesTo?: string[]
  nationalPokedexNumbers?: number[]
  legalities?: Record<string, string>
  attacks: CardAttack[]; weaknesses: CardWeakness[]; resistances: CardWeakness[]
  retreatCost: string[]; convertedRetreatCost: number | null
  imageUrlSmall: string | null; imageUrlLarge: string | null
  allPrices: CardAllPrices | null
  marketPrices: CardPriceVariant | null
  cardMarket?: CardMarketPrices | null
  cachedAt: string
}

export interface DeckCard {
  id: string; name: string; quantity: number
  setCode?: string; setName?: string; number?: string
  imageSmall?: string; type?: string; hp?: string
}

export interface DeckDto {
  id: string; userId: string; name: string; game: string; format: string
  cardsJson: string; isPublic: boolean; cardCount: number
  createdAt: string; updatedAt: string
}

export interface DeckListDto {
  id: string; name: string; game: string; format: string
  isPublic: boolean; cardCount: number; updatedAt: string
}

export interface TcgSet { code: string; name: string; game: string; series?: string; logoUrl?: string; totalCards: number; releaseDate?: string }

export interface TcgSearchParams {
  name?: string; game?: string; page?: number; pageSize?: number
  setId?: string; rarity?: string; cardType?: string
  // Pokémon extended
  artist?: string; supertype?: string; subtype?: string; energyType?: string
  regulationMark?: string; legality?: string; evolvesFrom?: string
  setSeries?: string; ptcgoCode?: string
  releaseDateFrom?: string; releaseDateTo?: string
  pokedexNumber?: number; hpMin?: number; hpMax?: number
}

export const tcgApi = {
  search: (name: string, game?: string, page = 1, pageSize = 30, setId?: string, rarity?: string, cardType?: string, extra?: Omit<TcgSearchParams, 'name'|'game'|'page'|'pageSize'|'setId'|'rarity'|'cardType'>) =>
    api.get<{ items: CardCache[]; totalCount: number; totalPages: number }>('/api/tcg/search',
      { params: { name, game, page, pageSize, ...(setId ? { setId } : {}), ...(rarity ? { rarity } : {}), ...(cardType ? { cardType } : {}), ...extra } }),
  searchAdvanced: (params: TcgSearchParams) =>
    api.get<{ items: CardCache[]; totalCount: number; totalPages: number }>('/api/tcg/search',
      { params }),
  searchByCode: (set: string, num: string, game = 'Pokemon') =>
    api.get<{ items: CardCache[]; totalCount: number }>('/api/tcg/search',
      { params: { set, num, game } }),
  getCard:  (id: string) => api.get<CardCache>(`/api/tcg/cards/${id}`),
  sets:     (game: string) => api.get<TcgSet[]>('/api/tcg/sets', { params: { game } }),
  /** `degradada` = o valor NÃO é a cotação real do momento (API fora do ar). `updatedAt`
   *  é quando a cotação foi lida de verdade, não a hora da requisição — null = nunca leu. */
  brlRate:  () => api.get<{
    usdToBrl: number
    updatedAt: string | null
    degradada: boolean
    aviso: string | null
    /** "Banco Central (PTAX)" ou "AwesomeAPI". Null quando nenhuma fonte respondeu. */
    fonte: string | null
  }>('/api/tcg/brl-rate'),
}

export const deckApi = {
  list:   (game?: string) => api.get<DeckListDto[]>('/api/deck', { params: game ? { game } : {} }),
  get:    (id: string)    => api.get<DeckDto>(`/api/deck/${id}`),
  create: (deck: { name: string; game: string; format?: string; cardsJson: string; isPublic: boolean }) =>
    api.post<DeckDto>('/api/deck', deck),
  update: (id: string, deck: { name: string; game: string; format?: string; cardsJson: string; isPublic: boolean }) =>
    api.put<DeckDto>(`/api/deck/${id}`, deck),
  delete: (id: string) => api.delete(`/api/deck/${id}`),
  getByUser: (userId: string) => api.get<DeckDto[]>(`/api/deck/user/${userId}`),
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface CardListingDto {
  id: string
  cardName: string; cardGame: string | null; cardImageUrl: string | null
  priceInCents: number; priceInReais: string
  condition: string; description: string | null
  status: string
  createdAt: string
  sellerId: string; sellerName: string; sellerImageUrl: string | null
  interestCount: number; myInterest: boolean
  interests?: { userId: string; userName: string; message: string | null; createdAt: string }[]
}

export interface MarketplacePageDto {
  items: CardListingDto[]; totalCount: number; totalPages: number
}

export interface CreateListingRequest {
  cardName: string; cardGame?: string; cardImageUrl?: string
  priceInCents: number; condition: string; description?: string
}

export interface MarketplaceInterestDto {
  id: string; userId: string; userName: string | null
  userProfileImage: string | null; userWhatsApp: string | null
  message: string | null; createdAt: string
}

export const marketplaceApi = {
  list: (params?: { page?: number; pageSize?: number; game?: string; search?: string; status?: string; sellerId?: string }) =>
    api.get<MarketplacePageDto>('/api/marketplace', { params }),
  mine: () => api.get<CardListingDto[]>('/api/marketplace/mine'),
  create: (req: CreateListingRequest) => api.post<CardListingDto>('/api/marketplace', req),
  update: (id: string, req: Partial<CreateListingRequest & { status: string }>) =>
    api.put<CardListingDto>(`/api/marketplace/${id}`, req),
  remove: (id: string) => api.delete(`/api/marketplace/${id}`),
  toggleInterest: (id: string, opts?: { message?: string; shareContact?: boolean }) =>
    api.post<{ interested: boolean; interestCount: number }>(`/api/marketplace/${id}/interest`, {
      message: opts?.message,
      shareContact: opts?.shareContact ?? false,
    }),
  interests: (id: string) =>
    api.get<MarketplaceInterestDto[]>(`/api/marketplace/${id}/interests`),
  uploadImage: async (file: File): Promise<string> => {
    const fd = new FormData(); fd.append('file', file)
    const res = await api.post<{ url: string }>('/api/upload/marketplace-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.url
  },
}
