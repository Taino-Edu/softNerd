import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../rotulos.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';
import '../widgets/marca.dart';
import 'conta.dart';
import 'liga.dart';
import 'mesa.dart';

/// Casca do app logado: cabeçalho da marca com a saudação e três abas (torneios, liga, conta).
class TelaInicio extends ConsumerStatefulWidget {
  const TelaInicio({super.key});
  @override
  ConsumerState<TelaInicio> createState() => _TelaInicioState();
}

class _TelaInicioState extends ConsumerState<TelaInicio> {
  int _aba = 0;

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(sessaoProvider);
    final primeiro = (u?.nome ?? '').split(' ').first;
    const subtitulos = ['Seus torneios e partidas', 'Ranking do mês', 'Seus dados'];
    return Scaffold(
      body: Column(children: [
        CabecalhoMarca(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
          child: Row(children: [
            AvatarJogador(pokemon: u?.pokemon, shiny: u?.shiny ?? false, nome: u?.nome ?? '', tamanho: 54, destaque: true),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Olá, $primeiro!', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22), overflow: TextOverflow.ellipsis),
                Text(subtitulos[_aba], style: TextStyle(color: Colors.white.withValues(alpha: .82), fontWeight: FontWeight.w700)),
              ]),
            ),
            Image.asset('assets/images/logo-santuario.webp', height: 46),
          ]),
        ),
        Expanded(child: IndexedStack(index: _aba, children: const [AbaTorneios(), AbaLiga(), AbaConta()])),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) { HapticFeedback.selectionClick(); setState(() => _aba = i); },
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
      HapticFeedback.mediumImpact();
      ref.invalidate(torneiosAtivosProvider);
      if (!mounted) return;
      avisar(context, 'Você entrou em ${r['nome'] ?? 'o torneio'}!');
      final id = r['championshipId'];
      if (id is String) Navigator.of(context).push(MaterialPageRoute(builder: (_) => TelaMesa(torneioId: id)));
    } catch (e) {
      HapticFeedback.heavyImpact();
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
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
        children: [
          Cartao(
            padding: const EdgeInsets.all(18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(gradient: Marca.degradeAmarelo, borderRadius: BorderRadius.circular(13)),
                  child: const Icon(Icons.pin_outlined, color: Marca.azulProfundo),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Entrar com o código', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                    Text('O código aparece no telão da loja.', style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600, fontSize: 13)),
                  ]),
                ),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _codigo,
                    textCapitalization: TextCapitalization.characters,
                    onSubmitted: (_) => _entrarComCodigo(),
                    style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2, fontSize: 18),
                    decoration: const InputDecoration(hintText: 'CÓDIGO', isDense: true),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(width: 118, child: BotaoAmarelo(texto: 'Entrar', aoTocar: _entrarComCodigo, carregando: _entrando)),
              ]),
            ]),
          ),
          const SizedBox(height: 24),
          const TituloSecao('Em andamento'),
          const SizedBox(height: 12),
          if (ativos.hasValue && ativos.requireValue.isEmpty)
            const Cartao(
              child: Column(children: [
                Icon(Icons.sports_esports_outlined, size: 40, color: Marca.textoSuave),
                SizedBox(height: 10),
                Text('Você não está em nenhum torneio agora.', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800)),
                SizedBox(height: 4),
                Text('Use o código do telão para entrar.', textAlign: TextAlign.center, style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600)),
              ]),
            )
          else if (ativos.hasValue)
            ...ativos.requireValue.map((t) => Padding(padding: const EdgeInsets.only(bottom: 12), child: _CardTorneio(t)))
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

  Color get _corStatus => switch (t.status) {
        'EmAndamento' => Marca.verde,
        'Inscricoes' => Marca.azul,
        'Cancelado' => Marca.vermelho,
        _ => Marca.laranja,
      };

  @override
  Widget build(BuildContext context) {
    final rodadas = t.numeroRodadas == null ? '' : ' de ${t.numeroRodadas}';
    return Cartao(
      aoTocar: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TelaMesa(torneioId: t.id))),
      child: Row(children: [
        Container(
          width: 52, height: 52,
          decoration: BoxDecoration(gradient: Marca.degrade, borderRadius: BorderRadius.circular(16)),
          child: const Icon(Icons.sports_esports, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.nome, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17), overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 4, children: [
              Pilula(rotuloStatusTorneio(t.status), cor: _corStatus),
              Pilula(rotuloModalidade(t.modalidade), cor: Marca.azul),
              if (t.rodadaAtual > 0) Pilula('Rodada ${t.rodadaAtual}$rodadas', cor: Marca.textoSuave),
            ]),
          ]),
        ),
        const SizedBox(width: 8),
        t.checkIn
            ? const Icon(Icons.chevron_right, color: Marca.textoSuave)
            : const Pilula('Check-in', cor: Marca.laranja, preenchida: true, icone: Icons.how_to_reg),
      ]),
    );
  }
}
