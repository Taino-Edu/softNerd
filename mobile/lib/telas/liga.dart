import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';
import '../widgets/marca.dart';

/// Ranking da Liga do mês: pódio com os três primeiros, lista do resto e a posição do jogador em destaque.
class AbaLiga extends ConsumerStatefulWidget {
  const AbaLiga({super.key});
  @override
  ConsumerState<AbaLiga> createState() => _AbaLigaState();
}

class _AbaLigaState extends ConsumerState<AbaLiga> {
  String _chave = 'atual';

  @override
  Widget build(BuildContext context) {
    final meses = ref.watch(mesesLigaProvider);
    final liga = ref.watch(ligaMensalProvider(_chave));
    final eu = ref.watch(sessaoProvider)?.id;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(ligaMensalProvider(_chave));
        ref.invalidate(mesesLigaProvider);
        await ref.read(ligaMensalProvider(_chave).future).catchError((_) => LigaMensal(ano: 0, mes: 0, rotulo: '', ranking: []));
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
        children: [
          if (meses.hasValue && meses.requireValue.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: _chave,
              decoration: const InputDecoration(labelText: 'Mês', isDense: true, prefixIcon: Icon(Icons.calendar_month_outlined)),
              borderRadius: BorderRadius.circular(16),
              items: [
                const DropdownMenuItem(value: 'atual', child: Text('Mês atual')),
                ...meses.requireValue.map((m) => DropdownMenuItem(
                      value: '${m.ano}-${m.mes.toString().padLeft(2, '0')}',
                      child: Text(m.rotulo),
                    )),
              ],
              onChanged: (v) => setState(() => _chave = v ?? 'atual'),
            ),
          const SizedBox(height: 16),
          if (liga.hasValue)
            ..._conteudo(liga.requireValue, eu)
          else
            SizedBox(
              height: 220,
              child: EstadoAsync<LigaMensal>(valor: liga, construir: (_) => const SizedBox(), aoTentar: () => ref.invalidate(ligaMensalProvider(_chave))),
            ),
        ],
      ),
    );
  }

  List<Widget> _conteudo(LigaMensal l, String? eu) {
    if (l.ranking.isEmpty) {
      return const [
        Cartao(
          child: Column(children: [
            Icon(Icons.emoji_events_outlined, size: 44, color: Marca.textoSuave),
            SizedBox(height: 10),
            Text('Ainda não há pontos neste mês.', style: TextStyle(fontWeight: FontWeight.w800)),
            SizedBox(height: 4),
            Text('Jogue uma etapa da Liga para entrar no ranking.', textAlign: TextAlign.center, style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600)),
          ]),
        ),
      ];
    }
    final minha = l.ranking.indexWhere((r) => r.userId == eu);
    final top = l.ranking.take(3).toList();
    final resto = l.ranking.skip(3).toList();
    return [
      if (minha >= 0) ...[
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(gradient: Marca.degradeAmarelo, borderRadius: BorderRadius.circular(22), boxShadow: [BoxShadow(color: Marca.amareloForte.withValues(alpha: .4), blurRadius: 16, offset: const Offset(0, 6))]),
          child: Row(children: [
            const Icon(Icons.emoji_events, color: Marca.azulProfundo, size: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Você está em ${minha + 1}º lugar', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: Marca.azulProfundo)),
                Text('${l.ranking[minha].pontos} pontos em ${l.ranking[minha].eventos} ${l.ranking[minha].eventos == 1 ? 'etapa' : 'etapas'}',
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Marca.azulProfundo)),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 22),
      ],
      TituloSecao(l.rotulo.isEmpty ? 'Ranking' : 'Ranking de ${l.rotulo}'),
      const SizedBox(height: 18),
      _Podio(top: top, eu: eu),
      if (resto.isNotEmpty) ...[
        const SizedBox(height: 18),
        ...resto.asMap().entries.map((e) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _LinhaRanking(posicao: e.key + 4, linha: e.value, souEu: e.value.userId == eu))),
      ],
    ];
  }
}

class _Podio extends StatelessWidget {
  const _Podio({required this.top, required this.eu});
  final List<RankingLinha> top;
  final String? eu;

  @override
  Widget build(BuildContext context) {
    // Ordem visual: 2º, 1º, 3º.
    final ordem = <int>[if (top.length > 1) 1, 0, if (top.length > 2) 2];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: ordem.map((i) {
        final r = top[i];
        final altura = switch (i) { 0 => 104.0, 1 => 78.0, _ => 60.0 };
        final cores = switch (i) {
          0 => [const Color(0xFFFFE45E), const Color(0xFFF5C518)],
          1 => [const Color(0xFFE5EAF2), const Color(0xFFB8C2D4)],
          _ => [const Color(0xFFF3C79B), const Color(0xFFCD8B4E)],
        };
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (i == 0) const Text('👑', style: TextStyle(fontSize: 22)),
              AvatarJogador(pokemon: r.pokemon, shiny: r.shiny, nome: r.nome, tamanho: i == 0 ? 74 : 58, destaque: r.userId == eu),
              const SizedBox(height: 6),
              Text(r.nome.split(' ').first, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: r.userId == eu ? FontWeight.w900 : FontWeight.w800, fontSize: 14)),
              Text('${r.pontos} pts', style: const TextStyle(color: Marca.azul, fontWeight: FontWeight.w900, fontSize: 15)),
              const SizedBox(height: 6),
              Container(
                height: altura,
                width: double.infinity,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: cores),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Text('${i + 1}º', style: TextStyle(fontWeight: FontWeight.w900, fontSize: i == 0 ? 34 : 26, color: i == 1 ? const Color(0xFF55627A) : Marca.azulProfundo)),
              ),
            ]),
          ),
        );
      }).toList(),
    );
  }
}

class _LinhaRanking extends StatelessWidget {
  const _LinhaRanking({required this.posicao, required this.linha, required this.souEu});
  final int posicao;
  final RankingLinha linha;
  final bool souEu;

  @override
  Widget build(BuildContext context) {
    return Cartao(
      cor: souEu ? const Color(0xFFE3ECFF) : null,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(children: [
        SizedBox(width: 30, child: Text('$posicaoº', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Marca.textoSuave))),
        AvatarJogador(pokemon: linha.pokemon, shiny: linha.shiny, nome: linha.nome, tamanho: 42, destaque: souEu),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(linha.nome, style: TextStyle(fontWeight: souEu ? FontWeight.w900 : FontWeight.w800), overflow: TextOverflow.ellipsis),
            Text('${linha.eventos} ${linha.eventos == 1 ? 'etapa' : 'etapas'}${linha.decks.isEmpty ? '' : ' · ${linha.decks.take(2).join(', ')}'}',
                style: const TextStyle(color: Marca.textoSuave, fontSize: 12, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
          ]),
        ),
        Text('${linha.pontos}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Marca.azul)),
        const SizedBox(width: 3),
        const Text('pts', style: TextStyle(color: Marca.textoSuave, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}
