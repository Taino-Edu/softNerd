import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../rotulos.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';

/// A tela do jogador num torneio: check-in, deck, mesa, relógio, resultado e classificação.
/// Atualiza sozinha a cada poucos segundos (o organizador muda o torneio pelo painel).
class TelaMesa extends ConsumerStatefulWidget {
  const TelaMesa({super.key, required this.torneioId});
  final String torneioId;
  @override
  ConsumerState<TelaMesa> createState() => _TelaMesaState();
}

class _TelaMesaState extends ConsumerState<TelaMesa> {
  Timer? _atualizador;
  bool _ocupado = false;

  @override
  void initState() {
    super.initState();
    _atualizador = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted && !_ocupado) ref.invalidate(minhaMesaProvider(widget.torneioId));
    });
  }

  @override
  void dispose() {
    _atualizador?.cancel();
    super.dispose();
  }

  void _recarregar() => ref.invalidate(minhaMesaProvider(widget.torneioId));

  /// Roda uma ação do jogador: trava os botões, mostra o erro da API e recarrega.
  Future<void> _fazer(Future<void> Function() acao, {String? sucesso}) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    try {
      await acao();
      if (mounted && sucesso != null) avisar(context, sucesso);
    } catch (e) {
      if (mounted) avisar(context, textoDoErro(e), erro: true);
    } finally {
      _recarregar();
      if (mounted) setState(() => _ocupado = false);
    }
  }

  String get _base => '/api/torneios/${widget.torneioId}';

  Future<bool> _confirmar(String titulo, String texto, String botao) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(botao)),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _trocarDeck(MinhaMesa m) async {
    final ctrl = TextEditingController(text: m.deck ?? '');
    final nome = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Qual é o seu deck?'),
        content: TextField(controller: ctrl, autofocus: true, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'Ex.: Charizard ex')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(c, ctrl.text.trim()), child: const Text('Salvar')),
        ],
      ),
    );
    ctrl.dispose();
    if (nome == null || nome.isEmpty) return;
    await _fazer(() => ref.read(apiProvider).put('$_base/meu-deck', corpo: {'deckNome': nome}), sucesso: 'Deck salvo.');
  }

  Future<void> _resultado(MinhaMesa m, String valor) async {
    final texto = switch (valor) { 'Venci' => 'você VENCEU', 'Perdi' => 'você PERDEU', _ => 'a partida foi EMPATE' };
    if (!await _confirmar('Confirmar resultado', 'Lançar que $texto contra ${m.oponente?.nome ?? 'o oponente'}?', 'Confirmar')) return;
    await _fazer(() => ref.read(apiProvider).post('$_base/partidas/${m.mesa!.partidaId}/resultado', corpo: {'resultado': valor}), sucesso: 'Resultado enviado.');
  }

  Future<void> _desistir() async {
    if (!await _confirmar('Desistir do torneio?', 'Você sai do torneio e não joga mais as próximas rodadas.', 'Desistir')) return;
    await _fazer(() => ref.read(apiProvider).post('$_base/desistir'), sucesso: 'Você desistiu do torneio.');
  }

  @override
  Widget build(BuildContext context) {
    final dados = ref.watch(minhaMesaProvider(widget.torneioId));
    final nome = dados.hasValue ? dados.requireValue.torneio.nome : 'Torneio';
    return Scaffold(
      appBar: AppBar(title: Text(nome, style: const TextStyle(fontWeight: FontWeight.w800))),
      body: EstadoAsync<MinhaMesa>(
        valor: dados,
        aoTentar: _recarregar,
        construir: (m) => RefreshIndicator(
          onRefresh: () async {
            _recarregar();
            await ref.read(minhaMesaProvider(widget.torneioId).future).catchError((_) => m);
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: _conteudo(m),
          ),
        ),
      ),
    );
  }

  List<Widget> _conteudo(MinhaMesa m) {
    final t = m.torneio;
    final espaco = const SizedBox(height: 14);
    final finalizado = t.status == 'Finalizado' || t.status == 'Cancelado';
    return [
      _CardCabecalho(t: t),
      espaco,
      if (m.desistiu)
        _Aviso(icone: Icons.flag, cor: Marca.vermelho, texto: 'Você desistiu na rodada ${m.desistiuNaRodada}.')
      else if (finalizado)
        _Aviso(icone: Icons.emoji_events, cor: Marca.azul, texto: t.status == 'Cancelado' ? 'Este torneio foi cancelado.' : 'Torneio finalizado. Veja a classificação final abaixo.')
      else ...[
        if (!m.checkIn) _CardCheckIn(ocupado: _ocupado, aoConfirmar: () => _fazer(() => ref.read(apiProvider).post('$_base/check-in'), sucesso: 'Check-in feito! Boa sorte.')),
        if (!m.checkIn) espaco,
        _CardDeck(deck: m.deck, ocupado: _ocupado, aoTrocar: () => _trocarDeck(m)),
        espaco,
        _CardMesa(
          m: m,
          ocupado: _ocupado,
          aoPronto: (v) => _fazer(() => ref.read(apiProvider).post('$_base/pronto', corpo: {'pronto': v})),
          aoResultado: (v) => _resultado(m, v),
        ),
        espaco,
        if (t.status == 'EmAndamento' || t.status == 'Inscricoes')
          TextButton.icon(
            onPressed: _ocupado ? null : _desistir,
            icon: const Icon(Icons.flag_outlined),
            label: const Text('Desistir do torneio'),
            style: TextButton.styleFrom(foregroundColor: Marca.vermelho),
          ),
      ],
      const SizedBox(height: 8),
      _Classificacao(linhas: t.classificacao, meuNome: ref.read(sessaoProvider)?.id),
      const SizedBox(height: 24),
    ];
  }
}

class _CardCabecalho extends StatelessWidget {
  const _CardCabecalho({required this.t});
  final TorneioPublico t;

  @override
  Widget build(BuildContext context) {
    final rodadas = t.numeroRodadas == null ? '' : ' de ${t.numeroRodadas}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 6, children: [
            Chip(label: Text(rotuloModalidade(t.modalidade)), visualDensity: VisualDensity.compact),
            Chip(label: Text(rotuloStatusTorneio(t.status)), visualDensity: VisualDensity.compact, backgroundColor: Marca.amarelo),
            if (t.rodadaAtual > 0) Chip(label: Text('Rodada ${t.rodadaAtual}$rodadas'), visualDensity: VisualDensity.compact),
          ]),
          if (t.jogo.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(t.jogo, style: const TextStyle(color: Colors.black54))),
          const SizedBox(height: 10),
          RelogioRodada(t: t),
        ]),
      ),
    );
  }
}

/// Contagem regressiva da rodada. Conta pela hora do servidor e redesenha a cada segundo.
class RelogioRodada extends StatefulWidget {
  const RelogioRodada({super.key, required this.t});
  final TorneioPublico t;
  @override
  State<RelogioRodada> createState() => _RelogioRodadaState();
}

class _RelogioRodadaState extends State<RelogioRodada> {
  Timer? _tic;

  @override
  void initState() {
    super.initState();
    _tic = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _tic?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final timer = t.timer;
    if (t.rodadaAtual == 0) return const Text('Aguardando o organizador gerar a 1ª rodada.', style: TextStyle(color: Colors.black54));
    if (!t.rodadaComecou || timer == null) return const Text('Monte seu setup: a rodada ainda não começou.', style: TextStyle(color: Colors.black54));
    final r = timer.restantes() ?? 0;
    final fim = timer.estado == 'finished' || (timer.estado == 'running' && r == 0);
    final cor = fim ? Marca.vermelho : (r <= 300 ? const Color(0xFFD97706) : Marca.azulEscuro);
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      Icon(timer.estado == 'paused' ? Icons.pause_circle : Icons.timer_outlined, color: cor, size: 30),
      const SizedBox(width: 10),
      Text(fim ? 'Tempo!' : mmss(r), style: TextStyle(fontSize: 38, fontWeight: FontWeight.w900, color: cor, fontFeatures: const [FontFeature.tabularFigures()])),
      if (timer.estado == 'paused') const Padding(padding: EdgeInsets.only(left: 10), child: Text('pausado', style: TextStyle(color: Colors.black54))),
    ]);
  }
}

class _CardCheckIn extends StatelessWidget {
  const _CardCheckIn({required this.ocupado, required this.aoConfirmar});
  final bool ocupado;
  final VoidCallback aoConfirmar;

  @override
  Widget build(BuildContext context) => Card(
        color: Marca.amarelo,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Você chegou?', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Marca.azulEscuro)),
            const SizedBox(height: 4),
            const Text('Faça o check-in para entrar no sorteio das mesas.', style: TextStyle(color: Marca.azulEscuro)),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: ocupado ? null : aoConfirmar, icon: const Icon(Icons.how_to_reg), label: const Text('Estou aqui')),
          ]),
        ),
      );
}

class _CardDeck extends StatelessWidget {
  const _CardDeck({required this.deck, required this.ocupado, required this.aoTrocar});
  final String? deck;
  final bool ocupado;
  final VoidCallback aoTrocar;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: const Icon(Icons.style, color: Marca.azul),
          title: Text(deck ?? 'Deck não informado', style: TextStyle(fontWeight: FontWeight.w700, color: deck == null ? Colors.black54 : null)),
          subtitle: const Text('Seu deck neste torneio'),
          trailing: TextButton(onPressed: ocupado ? null : aoTrocar, child: Text(deck == null ? 'Informar' : 'Trocar')),
        ),
      );
}

class _CardMesa extends StatelessWidget {
  const _CardMesa({required this.m, required this.ocupado, required this.aoPronto, required this.aoResultado});
  final MinhaMesa m;
  final bool ocupado;
  final void Function(bool) aoPronto;
  final void Function(String) aoResultado;

  @override
  Widget build(BuildContext context) {
    final t = m.torneio;
    final mesa = m.mesa;

    if (t.status == 'Planejado' || t.status == 'Inscricoes') {
      return const _Aviso(icone: Icons.hourglass_top, cor: Marca.azul, texto: 'O torneio ainda não começou. Fique de olho: esta tela atualiza sozinha.');
    }
    if (mesa == null) {
      return _Aviso(
        icone: Icons.hourglass_top,
        cor: Marca.azul,
        texto: !m.checkIn ? 'Faça o check-in para entrar nas próximas mesas.' : 'Você ainda não tem mesa nesta rodada. Aguarde o organizador.',
      );
    }
    final op = m.oponente;
    if (op == null) {
      return const _Aviso(icone: Icons.celebration, cor: Marca.verde, texto: 'Folga nesta rodada: sem oponente. Você ganha a rodada.');
    }
    if (mesa.aguardandoMesa) {
      return _Aviso(icone: Icons.chair_alt, cor: const Color(0xFFD97706), texto: 'Você joga contra ${op.nome}, mas todas as mesas estão ocupadas. Espere uma liberar.');
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: Marca.azul, borderRadius: BorderRadius.circular(10)),
              child: Text('Mesa ${mesa.mesa}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(width: 12),
            const Expanded(child: Text('Seu oponente', style: TextStyle(color: Colors.black54))),
          ]),
          const SizedBox(height: 10),
          Text(op.nome, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          if (op.deck != null) Text(op.deck!, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 14),
          ..._acoes(context, op),
        ]),
      ),
    );
  }

  List<Widget> _acoes(BuildContext context, JogadorMesa op) {
    final mesa = m.mesa!;
    if (mesa.resultado != null) {
      final euVenci = (m.souA && mesa.resultado == 'VitoriaA') || (!m.souA && mesa.resultado == 'VitoriaB');
      final empate = mesa.resultado == 'Empate';
      return [
        _Aviso(
          icone: empate ? Icons.handshake : (euVenci ? Icons.emoji_events : Icons.sentiment_neutral),
          cor: empate ? Marca.azul : (euVenci ? Marca.verde : Marca.vermelho),
          texto: empate ? 'Partida empatada.' : (euVenci ? 'Você venceu esta partida!' : 'Você perdeu esta partida.'),
        ),
        const SizedBox(height: 8),
        const Text('Resultado registrado. Aguarde a próxima rodada.', style: TextStyle(color: Colors.black54)),
      ];
    }
    if (!m.torneio.rodadaComecou) {
      return [
        Row(children: [
          Icon(m.euPronto ? Icons.check_circle : Icons.radio_button_unchecked, color: m.euPronto ? Marca.verde : Colors.black38),
          const SizedBox(width: 8),
          Text(m.euPronto ? 'Você está pronto' : 'Monte o setup e avise', style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 4),
        Text(m.oponentePronto ? '${op.nome} já está pronto.' : '${op.nome} ainda está montando.', style: const TextStyle(color: Colors.black54, fontSize: 13)),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: ocupado ? null : () => aoPronto(!m.euPronto),
          icon: Icon(m.euPronto ? Icons.undo : Icons.check),
          label: Text(m.euPronto ? 'Ainda não estou pronto' : 'Estou pronto'),
          style: m.euPronto ? FilledButton.styleFrom(backgroundColor: Colors.black45) : null,
        ),
      ];
    }
    final lancou = m.meuReport != null;
    return [
      if (lancou)
        _Aviso(icone: Icons.send, cor: Marca.azul, texto: 'Você lançou: ${_rotuloReport(m.meuReport!)}. ${m.reportOponente == null ? 'Aguardando ${op.nome} confirmar.' : ''}'.trim()),
      if (mesa.divergente)
        const Padding(padding: EdgeInsets.only(top: 8), child: _Aviso(icone: Icons.warning_amber, cor: Marca.vermelho, texto: 'Os dois resultados não batem. Chame o organizador.')),
      const SizedBox(height: 10),
      Text(lancou ? 'Errou? Lance de novo:' : 'Como foi a partida?', style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: _BotaoResultado('Venci', Marca.verde, Icons.emoji_events, ocupado, () => aoResultado('Venci'))),
        const SizedBox(width: 8),
        Expanded(child: _BotaoResultado('Empatei', Marca.azul, Icons.handshake, ocupado, () => aoResultado('Empatei'))),
        const SizedBox(width: 8),
        Expanded(child: _BotaoResultado('Perdi', Marca.vermelho, Icons.close, ocupado, () => aoResultado('Perdi'))),
      ]),
    ];
  }

  static String _rotuloReport(String r) => switch (r) { 'Venci' => 'venci', 'Perdi' => 'perdi', _ => 'empate' };
}

class _BotaoResultado extends StatelessWidget {
  const _BotaoResultado(this.texto, this.cor, this.icone, this.ocupado, this.aoTocar);
  final String texto;
  final Color cor;
  final IconData icone;
  final bool ocupado;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: ocupado ? null : aoTocar,
        style: FilledButton.styleFrom(backgroundColor: cor, minimumSize: const Size.fromHeight(64), padding: const EdgeInsets.symmetric(horizontal: 4)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icone, size: 22), const SizedBox(height: 2), Text(texto, style: const TextStyle(fontWeight: FontWeight.w800))]),
      );
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.icone, required this.cor, required this.texto});
  final IconData icone;
  final Color cor;
  final String texto;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: cor.withValues(alpha: .1), borderRadius: BorderRadius.circular(14), border: Border.all(color: cor.withValues(alpha: .35))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icone, color: cor),
          const SizedBox(width: 10),
          Expanded(child: Text(texto, style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
}

class _Classificacao extends StatelessWidget {
  const _Classificacao({required this.linhas, required this.meuNome});
  final List<LinhaTabela> linhas;
  final String? meuNome; // id do usuário logado

  @override
  Widget build(BuildContext context) {
    if (linhas.isEmpty) return const SizedBox();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Classificação', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      const SizedBox(height: 8),
      Card(
        child: Column(children: [
          for (final l in linhas)
            Container(
              color: l.userId == meuNome ? const Color(0xFFE3ECFF) : null,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                SizedBox(width: 28, child: Text('${l.posicao}º', style: const TextStyle(fontWeight: FontWeight.w800))),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.nome, style: TextStyle(fontWeight: l.userId == meuNome ? FontWeight.w900 : FontWeight.w600, decoration: l.desistiuNaRodada != null ? TextDecoration.lineThrough : null), overflow: TextOverflow.ellipsis),
                    Text('${l.vitorias}V ${l.empates}E ${l.derrotas}D', style: const TextStyle(color: Colors.black54, fontSize: 12)),
                  ]),
                ),
                Text('${l.pontos} pts', style: const TextStyle(fontWeight: FontWeight.w900, color: Marca.azulEscuro)),
              ]),
            ),
        ]),
      ),
    ]);
  }
}
