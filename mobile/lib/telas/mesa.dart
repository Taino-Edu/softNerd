import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/liga.dart';
import '../rotulos.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';
import '../widgets/marca.dart';

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

  /// Roda uma ação do jogador: trava os botões, vibra, mostra o erro da API e recarrega.
  Future<void> _fazer(Future<void> Function() acao, {String? sucesso}) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    try {
      await acao();
      HapticFeedback.mediumImpact();
      if (mounted && sucesso != null) avisar(context, sucesso);
    } catch (e) {
      HapticFeedback.heavyImpact();
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
        content: Text(texto, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(c, true), style: FilledButton.styleFrom(minimumSize: const Size(110, 44)), child: Text(botao)),
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
          FilledButton(onPressed: () => Navigator.pop(c, ctrl.text.trim()), style: FilledButton.styleFrom(minimumSize: const Size(100, 44)), child: const Text('Salvar')),
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
    return Scaffold(
      appBar: dados.hasValue ? null : AppBar(title: const Text('Torneio', style: TextStyle(fontWeight: FontWeight.w900))),
      body: EstadoAsync<MinhaMesa>(
        valor: dados,
        aoTentar: _recarregar,
        construir: (m) => RefreshIndicator(
          edgeOffset: 110,
          onRefresh: () async {
            _recarregar();
            await ref.read(minhaMesaProvider(widget.torneioId).future).catchError((_) => m);
          },
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _Cabecalho(m: m),
              Padding(padding: const EdgeInsets.fromLTRB(16, 18, 16, 28), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _conteudo(m))),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _conteudo(MinhaMesa m) {
    final t = m.torneio;
    const espaco = SizedBox(height: 14);
    final finalizado = t.status == 'Finalizado' || t.status == 'Cancelado';
    return [
      if (m.desistiu)
        _Aviso(icone: Icons.flag, cor: Marca.vermelho, texto: 'Você desistiu na rodada ${m.desistiuNaRodada}.')
      else if (finalizado)
        _Aviso(icone: Icons.emoji_events, cor: Marca.azul, texto: t.status == 'Cancelado' ? 'Este torneio foi cancelado.' : 'Torneio finalizado. Veja a classificação final abaixo.')
      else ...[
        if (!m.checkIn) ...[
          _CardCheckIn(ocupado: _ocupado, aoConfirmar: () => _fazer(() => ref.read(apiProvider).post('$_base/check-in'), sucesso: 'Check-in feito! Boa sorte.')),
          espaco,
        ],
        _CardDeck(deck: m.deck, ocupado: _ocupado, aoTrocar: () => _trocarDeck(m)),
        espaco,
        _CardMesa(
          m: m,
          ocupado: _ocupado,
          aoPronto: (v) => _fazer(() => ref.read(apiProvider).post('$_base/pronto', corpo: {'pronto': v})),
          aoResultado: (v) => _resultado(m, v),
        ),
        if (t.status == 'EmAndamento' || t.status == 'Inscricoes') ...[
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: _ocupado ? null : _desistir,
            icon: const Icon(Icons.flag_outlined),
            label: const Text('Desistir do torneio'),
            style: TextButton.styleFrom(foregroundColor: Marca.vermelho, textStyle: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ],
      const SizedBox(height: 10),
      _Classificacao(linhas: t.classificacao, meuId: ref.read(sessaoProvider)?.id),
    ];
  }
}

/// Topo azul da tela: voltar, nome do torneio, etiquetas e o relógio da rodada em destaque.
class _Cabecalho extends StatelessWidget {
  const _Cabecalho({required this.m});
  final MinhaMesa m;

  @override
  Widget build(BuildContext context) {
    final t = m.torneio;
    final rodadas = t.numeroRodadas == null ? '' : ' de ${t.numeroRodadas}';
    return CabecalhoMarca(
      padding: const EdgeInsets.fromLTRB(8, 2, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          IconButton(onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.arrow_back_rounded, color: Colors.white)),
          Expanded(child: Text(t.nome, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 21, height: 1.1))),
        ]),
        Padding(
          padding: const EdgeInsets.only(left: 12, top: 8),
          child: Wrap(spacing: 8, runSpacing: 6, children: [
            Pilula(rotuloModalidade(t.modalidade), cor: Colors.white),
            Pilula(rotuloStatusTorneio(t.status), cor: Marca.amarelo, preenchida: false),
            if (t.rodadaAtual > 0) Pilula('Rodada ${t.rodadaAtual}$rodadas', cor: Colors.white),
          ]),
        ),
        Padding(padding: const EdgeInsets.only(left: 12, top: 16), child: RelogioRodada(t: t)),
      ]),
    );
  }
}

/// Contagem regressiva da rodada, em amarelo sobre o azul. Conta pela hora do servidor.
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

  Widget _msg(IconData i, String texto) => Row(children: [
        Icon(i, color: Colors.white70, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(texto, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
      ]);

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final timer = t.timer;
    if (t.status == 'Finalizado') return _msg(Icons.flag, 'Torneio encerrado');
    if (t.rodadaAtual == 0) return _msg(Icons.hourglass_top, 'Aguardando o organizador gerar a 1ª rodada.');
    if (!t.rodadaComecou || timer == null) return _msg(Icons.build_circle_outlined, 'Monte seu setup: a rodada ainda não começou.');
    final r = timer.restantes() ?? 0;
    final fim = timer.estado == 'finished' || (timer.estado == 'running' && r == 0);
    final cor = fim ? const Color(0xFFFF8A80) : (r <= 300 ? const Color(0xFFFFB74D) : Marca.amarelo);
    final fracao = timer.duracaoSegundos == 0 ? 0.0 : (r / timer.duracaoSegundos).clamp(0.0, 1.0);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(timer.estado == 'paused' ? 'TEMPO DA RODADA · PAUSADO' : 'TEMPO DA RODADA', style: TextStyle(color: Colors.white.withValues(alpha: .75), fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.2)),
      Text(fim ? 'Tempo!' : mmss(r), style: TextStyle(fontSize: 60, height: 1.05, fontWeight: FontWeight.w900, color: cor, fontFeatures: const [FontFeature.tabularFigures()])),
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: LinearProgressIndicator(value: fracao, minHeight: 8, color: cor, backgroundColor: Colors.white.withValues(alpha: .22)),
      ),
    ]);
  }
}

class _CardCheckIn extends StatelessWidget {
  const _CardCheckIn({required this.ocupado, required this.aoConfirmar});
  final bool ocupado;
  final VoidCallback aoConfirmar;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(gradient: Marca.degradeAmarelo, borderRadius: BorderRadius.circular(22), boxShadow: [BoxShadow(color: Marca.amareloForte.withValues(alpha: .4), blurRadius: 16, offset: const Offset(0, 6))]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Você chegou?', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Marca.azulProfundo)),
          const SizedBox(height: 2),
          const Text('Faça o check-in para entrar no sorteio das mesas.', style: TextStyle(color: Marca.azulProfundo, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: ocupado ? null : aoConfirmar,
            icon: const Icon(Icons.how_to_reg),
            label: const Text('Estou aqui'),
            style: FilledButton.styleFrom(backgroundColor: Marca.azulProfundo, foregroundColor: Colors.white),
          ),
        ]),
      );
}

class _CardDeck extends StatelessWidget {
  const _CardDeck({required this.deck, required this.ocupado, required this.aoTrocar});
  final String? deck;
  final bool ocupado;
  final VoidCallback aoTrocar;

  @override
  Widget build(BuildContext context) => Cartao(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Row(children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(color: Marca.azul.withValues(alpha: .1), borderRadius: BorderRadius.circular(13)),
            child: const Icon(Icons.style, color: Marca.azul),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(deck ?? 'Deck não informado', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: deck == null ? Marca.textoSuave : null), overflow: TextOverflow.ellipsis),
              const Text('Seu deck neste torneio', style: TextStyle(color: Marca.textoSuave, fontSize: 12.5, fontWeight: FontWeight.w600)),
            ]),
          ),
          TextButton(onPressed: ocupado ? null : aoTrocar, child: Text(deck == null ? 'Informar' : 'Trocar', style: const TextStyle(fontWeight: FontWeight.w900))),
        ]),
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
      return _Aviso(icone: Icons.chair_alt, cor: Marca.laranja, texto: 'Você joga contra ${op.nome}, mas todas as mesas estão ocupadas. Espere uma liberar.');
    }
    final eu = m.souA ? mesa.a : mesa.b!;

    return Cartao(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _Lado(j: eu, rotulo: 'Você', pronto: m.euPronto, mostrarPronto: !t.rodadaComecou && mesa.resultado == null)),
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Column(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(gradient: Marca.degrade, borderRadius: BorderRadius.circular(12)),
                child: Text('MESA ${mesa.mesa}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12.5)),
              ),
              const SizedBox(height: 8),
              const Text('VS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 26, color: Marca.amareloForte)),
            ]),
          ),
          Expanded(child: _Lado(j: op, rotulo: 'Oponente', pronto: m.oponentePronto, mostrarPronto: !t.rodadaComecou && mesa.resultado == null)),
        ]),
        const SizedBox(height: 18),
        ..._acoes(context, op),
      ]),
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
        const SizedBox(height: 10),
        const Text('Resultado registrado. Aguarde a próxima rodada.', textAlign: TextAlign.center, style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w700)),
      ];
    }
    if (!m.torneio.rodadaComecou) {
      return [
        if (m.euPronto)
          OutlinedButton.icon(onPressed: ocupado ? null : () => aoPronto(false), icon: const Icon(Icons.undo), label: const Text('Ainda não estou pronto'), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)))
        else
          BotaoAmarelo(texto: 'Estou pronto', icone: Icons.check_circle_outline, aoTocar: ocupado ? null : () => aoPronto(true)),
      ];
    }
    final lancou = m.meuReport != null;
    return [
      if (lancou)
        _Aviso(icone: Icons.send, cor: Marca.azul, texto: 'Você lançou: ${_rotuloReport(m.meuReport!)}. ${m.reportOponente == null ? 'Aguardando ${op.nome} confirmar.' : ''}'.trim()),
      if (mesa.divergente)
        const Padding(padding: EdgeInsets.only(top: 8), child: _Aviso(icone: Icons.warning_amber, cor: Marca.vermelho, texto: 'Os dois resultados não batem. Chame o organizador.')),
      const SizedBox(height: 14),
      Text(lancou ? 'Errou? Lance de novo:' : 'Como foi a partida?', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _BotaoResultado('Venci', const [Color(0xFF22C55E), Color(0xFF15803D)], Icons.emoji_events, ocupado, () => aoResultado('Venci'))),
        const SizedBox(width: 10),
        Expanded(child: _BotaoResultado('Empatei', const [Marca.azul, Marca.azulEscuro], Icons.handshake, ocupado, () => aoResultado('Empatei'))),
        const SizedBox(width: 10),
        Expanded(child: _BotaoResultado('Perdi', const [Color(0xFFEF4444), Color(0xFFB91C1C)], Icons.close_rounded, ocupado, () => aoResultado('Perdi'))),
      ]),
    ];
  }

  static String _rotuloReport(String r) => switch (r) { 'Venci' => 'venci', 'Perdi' => 'perdi', _ => 'empate' };
}

/// Um dos dois lados da mesa: foto (Pokémon), nome, deck e se já está pronto.
class _Lado extends StatelessWidget {
  const _Lado({required this.j, required this.rotulo, required this.pronto, required this.mostrarPronto});
  final JogadorMesa j;
  final String rotulo;
  final bool pronto;
  final bool mostrarPronto;

  @override
  Widget build(BuildContext context) => Column(children: [
        Text(rotulo.toUpperCase(), style: const TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 1)),
        const SizedBox(height: 8),
        Stack(clipBehavior: Clip.none, children: [
          AvatarJogador(pokemon: j.pokemon, shiny: j.shiny, nome: j.nome, tamanho: 74, destaque: rotulo == 'Você'),
          if (mostrarPronto)
            Positioned(
              right: -2, bottom: -2,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(color: pronto ? Marca.verde : Marca.laranja, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                child: Icon(pronto ? Icons.check : Icons.more_horiz, size: 14, color: Colors.white),
              ),
            ),
        ]),
        const SizedBox(height: 8),
        Text(j.nome, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, height: 1.1)),
        if (j.deck != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(j.deck!, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600, fontSize: 12.5))),
        if (mostrarPronto) Padding(padding: const EdgeInsets.only(top: 4), child: Text(pronto ? 'Pronto' : 'Montando...', style: TextStyle(color: pronto ? Marca.verde : Marca.laranja, fontWeight: FontWeight.w800, fontSize: 12.5))),
      ]);
}

class _BotaoResultado extends StatelessWidget {
  const _BotaoResultado(this.texto, this.cores, this.icone, this.ocupado, this.aoTocar);
  final String texto;
  final List<Color> cores;
  final IconData icone;
  final bool ocupado;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: ocupado ? .5 : 1,
        child: Container(
          height: 82,
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: cores),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [BoxShadow(color: cores.last.withValues(alpha: .35), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: ocupado ? null : () { HapticFeedback.lightImpact(); aoTocar(); },
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icone, color: Colors.white, size: 26),
                const SizedBox(height: 4),
                Text(texto, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
              ]),
            ),
          ),
        ),
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
        decoration: BoxDecoration(color: cor.withValues(alpha: .10), borderRadius: BorderRadius.circular(16), border: Border.all(color: cor.withValues(alpha: .35))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icone, color: cor),
          const SizedBox(width: 10),
          Expanded(child: Text(texto, style: const TextStyle(fontWeight: FontWeight.w700, height: 1.25))),
        ]),
      );
}

class _Classificacao extends StatelessWidget {
  const _Classificacao({required this.linhas, required this.meuId});
  final List<LinhaTabela> linhas;
  final String? meuId;

  @override
  Widget build(BuildContext context) {
    if (linhas.isEmpty) return const SizedBox();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const TituloSecao('Classificação'),
      const SizedBox(height: 12),
      Cartao(
        padding: EdgeInsets.zero,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: Column(children: [
            for (final l in linhas)
              Container(
                color: l.userId == meuId ? const Color(0xFFE3ECFF) : null,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(children: [
                  SizedBox(width: 32, child: Text(switch (l.posicao) { 1 => '🥇', 2 => '🥈', 3 => '🥉', _ => '${l.posicao}º' }, style: TextStyle(fontWeight: FontWeight.w900, fontSize: l.posicao <= 3 ? 20 : 14, color: Marca.textoSuave))),
                  AvatarJogador(pokemon: l.pokemon, shiny: l.shiny, nome: l.nome, tamanho: 38, destaque: l.userId == meuId),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l.nome, style: TextStyle(fontWeight: l.userId == meuId ? FontWeight.w900 : FontWeight.w800, decoration: l.desistiuNaRodada != null ? TextDecoration.lineThrough : null), overflow: TextOverflow.ellipsis),
                      Text('${l.vitorias}V ${l.empates}E ${l.derrotas}D', style: const TextStyle(color: Marca.textoSuave, fontSize: 12, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                  Text('${l.pontos}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Marca.azul)),
                  const SizedBox(width: 3),
                  const Text('pts', style: TextStyle(color: Marca.textoSuave, fontSize: 12, fontWeight: FontWeight.w700)),
                ]),
              ),
          ]),
        ),
      ),
    ]);
  }
}
