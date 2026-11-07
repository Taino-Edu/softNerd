import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tema.dart';

/// Faixa azul em degradê com cantos de baixo arredondados e bolhas decorativas (como o topo do site).
class CabecalhoMarca extends StatelessWidget {
  const CabecalhoMarca({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(20, 12, 20, 26), this.raio = 32});
  final Widget child;
  final EdgeInsets padding;
  final double raio;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: Marca.degrade,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(raio)),
        boxShadow: Marca.sombra(.25),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(raio)),
        child: Stack(children: [
          Positioned(right: -40, top: -50, child: _Bolha(170, .07)),
          Positioned(left: -30, bottom: -60, child: _Bolha(140, .06)),
          Padding(padding: padding, child: SafeArea(bottom: false, child: SizedBox(width: double.infinity, child: child))),
        ]),
      ),
    );
  }
}

class _Bolha extends StatelessWidget {
  const _Bolha(this.tamanho, this.opacidade);
  final double tamanho;
  final double opacidade;
  @override
  Widget build(BuildContext context) =>
      Container(width: tamanho, height: tamanho, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: opacidade)));
}

/// Cartão branco de cantos redondos com sombra azul suave.
class Cartao extends StatelessWidget {
  const Cartao({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.cor, this.aoTocar, this.borda = true});
  final Widget child;
  final EdgeInsets padding;
  final Color? cor;
  final VoidCallback? aoTocar;
  final bool borda;

  @override
  Widget build(BuildContext context) {
    final conteudo = Padding(padding: padding, child: child);
    return Container(
      decoration: BoxDecoration(
        color: cor ?? Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: borda ? Border.all(color: Marca.borda) : null,
        boxShadow: Marca.sombra(.07),
      ),
      child: aoTocar == null
          ? conteudo
          : Material(
              color: Colors.transparent,
              child: InkWell(borderRadius: BorderRadius.circular(22), onTap: () { HapticFeedback.selectionClick(); aoTocar!(); }, child: conteudo),
            ),
    );
  }
}

/// Botão principal da marca: amarelo em degradê, texto azul-escuro (igual ao "Abrir Comanda" do site).
class BotaoAmarelo extends StatelessWidget {
  const BotaoAmarelo({super.key, required this.texto, required this.aoTocar, this.icone, this.carregando = false});
  final String texto;
  final VoidCallback? aoTocar;
  final IconData? icone;
  final bool carregando;

  @override
  Widget build(BuildContext context) {
    final ativo = aoTocar != null && !carregando;
    return Opacity(
      opacity: aoTocar == null && !carregando ? .5 : 1,
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          gradient: Marca.degradeAmarelo,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Marca.amareloForte.withValues(alpha: .45), blurRadius: 14, offset: const Offset(0, 5))],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: ativo ? () { HapticFeedback.lightImpact(); aoTocar!(); } : null,
            child: Center(
              child: carregando
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.6, color: Marca.azulProfundo))
                  : Row(mainAxisSize: MainAxisSize.min, children: [
                      if (icone != null) ...[Icon(icone, color: Marca.azulProfundo, size: 22), const SizedBox(width: 8)],
                      Text(texto, style: const TextStyle(color: Marca.azulProfundo, fontWeight: FontWeight.w900, fontSize: 16)),
                    ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cápsula pequena de informação (status, rodada...).
class Pilula extends StatelessWidget {
  const Pilula(this.texto, {super.key, this.cor = Marca.azul, this.preenchida = false, this.icone});
  final String texto;
  final Color cor;
  final bool preenchida;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final fundo = preenchida ? cor : cor.withValues(alpha: .12);
    final frente = preenchida ? Colors.white : cor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
      decoration: BoxDecoration(color: fundo, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icone != null) ...[Icon(icone, size: 14, color: frente), const SizedBox(width: 4)],
        Text(texto, style: TextStyle(color: frente, fontWeight: FontWeight.w800, fontSize: 12.5)),
      ]),
    );
  }
}

/// "Foto" do jogador: o Pokémon preferido dele (sprite do Pokémon Showdown, como no site); sem Pokémon,
/// ou sem internet, vira a inicial do nome.
class AvatarJogador extends StatelessWidget {
  const AvatarJogador({super.key, this.pokemon, this.shiny = false, required this.nome, this.tamanho = 48, this.destaque = false});
  final String? pokemon;
  final bool shiny;
  final String nome;
  final double tamanho;
  final bool destaque;

  Widget _inicial() => Center(
        child: Text(nome.isEmpty ? '?' : nome.characters.first.toUpperCase(),
            style: TextStyle(fontSize: tamanho * .42, fontWeight: FontWeight.w900, color: Marca.azulProfundo)),
      );

  @override
  Widget build(BuildContext context) {
    final url = pokemon == null ? null : 'https://play.pokemonshowdown.com/sprites/gen5${shiny ? '-shiny' : ''}/$pokemon.png';
    return Container(
      width: tamanho,
      height: tamanho,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: destaque ? Marca.degradeAmarelo : const LinearGradient(colors: [Color(0xFFE6EEFF), Color(0xFFD3E2FF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        border: Border.all(color: destaque ? Marca.amareloForte : Colors.white, width: 2.5),
        boxShadow: Marca.sombra(.12),
      ),
      child: ClipOval(
        child: url == null
            ? _inicial()
            : Padding(
                padding: EdgeInsets.all(tamanho * .08),
                child: Image.network(url, fit: BoxFit.contain, filterQuality: FilterQuality.none, errorBuilder: (_, _, _) => _inicial(), loadingBuilder: (c, w, p) => p == null ? w : _inicial()),
              ),
      ),
    );
  }
}

/// Título de seção com uma barrinha amarela, no estilo do site.
class TituloSecao extends StatelessWidget {
  const TituloSecao(this.texto, {super.key, this.acao});
  final String texto;
  final Widget? acao;
  @override
  Widget build(BuildContext context) => Row(children: [
        Container(width: 5, height: 20, decoration: BoxDecoration(gradient: Marca.degradeAmarelo, borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 10),
        Expanded(child: Text(texto, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18))),
        ?acao,
      ]);
}
