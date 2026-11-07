import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';

/// Ranking da Liga do mês, com o mês escolhível e a linha do próprio jogador em destaque.
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
        padding: const EdgeInsets.all(16),
        children: [
          if (meses.hasValue && meses.requireValue.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: _chave,
              decoration: const InputDecoration(labelText: 'Mês', isDense: true),
              items: [
                const DropdownMenuItem(value: 'atual', child: Text('Mês atual')),
                ...meses.requireValue.map((m) => DropdownMenuItem(
                      value: '${m.ano}-${m.mes.toString().padLeft(2, '0')}',
                      child: Text(m.rotulo),
                    )),
              ],
              onChanged: (v) => setState(() => _chave = v ?? 'atual'),
            ),
          const SizedBox(height: 14),
          if (liga.hasValue) ..._ranking(liga.requireValue, eu) else SizedBox(
            height: 220,
            child: EstadoAsync<LigaMensal>(valor: liga, construir: (_) => const SizedBox(), aoTentar: () => ref.invalidate(ligaMensalProvider(_chave))),
          ),
        ],
      ),
    );
  }

  List<Widget> _ranking(LigaMensal l, String? eu) {
    if (l.ranking.isEmpty) {
      return const [
        Card(child: Padding(padding: EdgeInsets.all(20), child: Text('Ainda não há pontos neste mês.', style: TextStyle(color: Colors.black54)))),
      ];
    }
    final minha = l.ranking.indexWhere((r) => r.userId == eu);
    return [
      if (minha >= 0)
        Card(
          color: Marca.amarelo,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              const Icon(Icons.emoji_events, color: Marca.azulEscuro, size: 32),
              const SizedBox(width: 12),
              Expanded(
                child: Text('Você está em ${minha + 1}º lugar com ${l.ranking[minha].pontos} pontos',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Marca.azulEscuro)),
              ),
            ]),
          ),
        ),
      if (minha >= 0) const SizedBox(height: 12),
      Text(l.rotulo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      const SizedBox(height: 8),
      ...l.ranking.asMap().entries.map((e) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _LinhaRanking(posicao: e.key + 1, linha: e.value, souEu: e.value.userId == eu),
          )),
    ];
  }
}

class _LinhaRanking extends StatelessWidget {
  const _LinhaRanking({required this.posicao, required this.linha, required this.souEu});
  final int posicao;
  final RankingLinha linha;
  final bool souEu;

  @override
  Widget build(BuildContext context) {
    final medalha = switch (posicao) { 1 => '🥇', 2 => '🥈', 3 => '🥉', _ => null };
    return Card(
      color: souEu ? const Color(0xFFE3ECFF) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          SizedBox(width: 34, child: Text(medalha ?? '$posicaoº', style: TextStyle(fontSize: medalha != null ? 22 : 15, fontWeight: FontWeight.w800))),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(linha.nome, style: TextStyle(fontWeight: souEu ? FontWeight.w900 : FontWeight.w700), overflow: TextOverflow.ellipsis),
              Text('${linha.eventos} ${linha.eventos == 1 ? 'etapa' : 'etapas'}${linha.decks.isEmpty ? '' : ' · ${linha.decks.take(2).join(', ')}'}',
                  style: const TextStyle(color: Colors.black54, fontSize: 12), overflow: TextOverflow.ellipsis),
            ]),
          ),
          Text('${linha.pontos}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Marca.azulEscuro)),
          const SizedBox(width: 4),
          const Text('pts', style: TextStyle(color: Colors.black54, fontSize: 12)),
        ]),
      ),
    );
  }
}
