import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../rotulos.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';
import 'conta.dart';
import 'liga.dart';
import 'mesa.dart';

/// Casca do app logado: três abas (torneios, liga, conta).
class TelaInicio extends StatefulWidget {
  const TelaInicio({super.key});
  @override
  State<TelaInicio> createState() => _TelaInicioState();
}

class _TelaInicioState extends State<TelaInicio> {
  int _aba = 0;

  @override
  Widget build(BuildContext context) {
    const titulos = ['Meus torneios', 'Liga do mês', 'Minha conta'];
    return Scaffold(
      appBar: AppBar(title: Text(titulos[_aba], style: const TextStyle(fontWeight: FontWeight.w800))),
      body: IndexedStack(index: _aba, children: const [AbaTorneios(), AbaLiga(), AbaConta()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => setState(() => _aba = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.sports_esports_outlined), selectedIcon: Icon(Icons.sports_esports), label: 'Torneios'),
          NavigationDestination(icon: Icon(Icons.emoji_events_outlined), selectedIcon: Icon(Icons.emoji_events), label: 'Liga'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Conta'),
        ],
      ),
    );
  }
}

class AbaTorneios extends ConsumerStatefulWidget {
  const AbaTorneios({super.key});
  @override
  ConsumerState<AbaTorneios> createState() => _AbaTorneiosState();
}

class _AbaTorneiosState extends ConsumerState<AbaTorneios> {
  final _codigo = TextEditingController();
  bool _entrando = false;

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _entrarComCodigo() async {
    final codigo = _codigo.text.trim().toUpperCase();
    if (codigo.isEmpty) {
      avisar(context, 'Digite o código que está no telão.', erro: true);
      return;
    }
    setState(() => _entrando = true);
    try {
      final r = await ref.read(apiProvider).postMapa('/api/torneios/entrar', corpo: {'codigo': codigo});
      _codigo.clear();
      ref.invalidate(torneiosAtivosProvider);
      if (!mounted) return;
      avisar(context, 'Você entrou em ${r['nome'] ?? 'o torneio'}!');
      final id = r['championshipId'];
      if (id is String) Navigator.of(context).push(MaterialPageRoute(builder: (_) => TelaMesa(torneioId: id)));
    } catch (e) {
      if (mounted) avisar(context, textoDoErro(e), erro: true);
    } finally {
      if (mounted) setState(() => _entrando = false);
    }
  }

  Future<void> _atualizar() async {
    ref.invalidate(torneiosAtivosProvider);
    await ref.read(torneiosAtivosProvider.future).catchError((_) => <TorneioResumo>[]);
  }

  @override
  Widget build(BuildContext context) {
    final ativos = ref.watch(torneiosAtivosProvider);
    return RefreshIndicator(
      onRefresh: _atualizar,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Entrar com o código', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 4),
                const Text('O código aparece no telão da loja.', style: TextStyle(color: Colors.black54)),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _codigo,
                      textCapitalization: TextCapitalization.characters,
                      onSubmitted: (_) => _entrarComCodigo(),
                      decoration: const InputDecoration(hintText: 'Código', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 110,
                    child: FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                      onPressed: _entrando ? null : _entrarComCodigo,
                      child: _entrando ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Entrar'),
                    ),
                  ),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Em andamento', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 10),
          if (ativos.hasValue && ativos.requireValue.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('Você não está em nenhum torneio agora. Use o código do telão para entrar.', style: TextStyle(color: Colors.black54)),
              ),
            )
          else if (ativos.hasValue)
            ...ativos.requireValue.map((t) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _CardTorneio(t)))
          else
            SizedBox(
              height: 160,
              child: EstadoAsync<List<TorneioResumo>>(valor: ativos, construir: (_) => const SizedBox(), aoTentar: () => ref.invalidate(torneiosAtivosProvider)),
            ),
        ],
      ),
    );
  }
}

class _CardTorneio extends StatelessWidget {
  const _CardTorneio(this.t);
  final TorneioResumo t;

  @override
  Widget build(BuildContext context) {
    final rodadas = t.numeroRodadas == null ? '' : ' de ${t.numeroRodadas}';
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TelaMesa(torneioId: t.id))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(color: Marca.azul.withValues(alpha: .1), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.sports_esports, color: Marca.azul),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.nome, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 4),
                Text('${rotuloModalidade(t.modalidade)} · ${rotuloStatusTorneio(t.status)}'
                    '${t.rodadaAtual > 0 ? ' · Rodada ${t.rodadaAtual}$rodadas' : ''}',
                    style: const TextStyle(color: Colors.black54, fontSize: 13)),
              ]),
            ),
            if (!t.checkIn)
              const Chip(label: Text('Fazer check-in'), visualDensity: VisualDensity.compact, backgroundColor: Marca.amarelo)
            else
              const Icon(Icons.chevron_right),
          ]),
        ),
      ),
    );
  }
}
