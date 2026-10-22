"""
gerar-pokedex.py — lista de Pokémon do "Qual o seu Pokémon preferido?" (v1.65.0)

Baixa o Pokédex do Pokémon Showdown (mesma fonte dos sprites do deck, lib/spritesDeck.ts) e
grava frontend/public/pokedex.json enxuto: [[id_do_sprite, nome, numero], ...] ordenado pelo
número da Pokédex. Entram as 1025 espécies e as formas que o jogador reconhece (Mega, regionais,
Primal, Origem, Therian); ficam de fora Gigantamax, Totem, CAP e formas de batalha.

    python scripts/gerar-pokedex.py

Rode de novo quando sair geração nova (o arquivo é estático: o site não depende do Showdown
pra buscar, só pra mostrar o sprite).
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://play.pokemonshowdown.com/data/pokedex.json"
SAIDA = Path(__file__).resolve().parent.parent / "frontend" / "public" / "pokedex.json"

# Forma do Showdown -> como aparece pro jogador
FORMAS = {
    "Mega": "Mega {n}", "Mega-X": "Mega {n} X", "Mega-Y": "Mega {n} Y",
    "Alola": "{n} de Alola", "Galar": "{n} de Galar", "Hisui": "{n} de Hisui",
    "Paldea": "{n} de Paldea", "Paldea-Combat": "{n} de Paldea", "Paldea-Blaze": "{n} de Paldea (Fogo)", "Paldea-Aqua": "{n} de Paldea (Água)",
    "Primal": "{n} Primal", "Origin": "{n} Origem", "Therian": "{n} Therian",
}


def tid(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def main() -> None:
    # Sem User-Agent o Showdown responde 403
    pedido = urllib.request.Request(URL, headers={"User-Agent": "santuarionerd-gerar-pokedex/1.0"})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        dex = json.load(r)

    lista = []
    for v in dex.values():
        num = v.get("num", 0)
        if not (1 <= num <= 1025) or v.get("isNonstandard") not in (None, "Past"):
            continue
        forma = v.get("forme")
        if not forma:
            lista.append([tid(v["name"]), v["name"], num])
        elif forma in FORMAS:
            base = v["baseSpecies"]
            # Arquivo do sprite: espécie-forma ("charizard-megax", "raichu-alola")
            lista.append([f"{tid(base)}-{tid(forma)}", FORMAS[forma].format(n=base), num])

    lista.sort(key=lambda p: (p[2], "-" in p[0], p[1]))
    ids = [p[0] for p in lista]
    if len(ids) != len(set(ids)):
        sys.exit("id de sprite repetido — confira as formas")

    SAIDA.write_text(json.dumps(lista, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(lista)} Pokémon em {SAIDA.relative_to(SAIDA.parent.parent.parent)}")


if __name__ == "__main__":
    main()
