// Modelos do jogador da Liga/Liguinha. Espelham frontend/lib/api/liga.ts (o contrato é o mesmo da web).
// Leitura defensiva: o servidor pode mandar campo nulo ou novo sem derrubar o app.

String _s(dynamic v, [String padrao = '']) => v is String ? v : padrao;
String? _sn(dynamic v) => v is String && v.isNotEmpty ? v : null;
int _i(dynamic v, [int padrao = 0]) => v is num ? v.toInt() : padrao;
int? _in(dynamic v) => v is num ? v.toInt() : null;
bool _b(dynamic v) => v == true;
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;
List<Map<String, dynamic>> _lista(dynamic v) =>
    v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];

class Usuario {
  Usuario({required this.id, required this.nome, required this.papel});
  final String id;
  final String nome;
  final String papel;

  factory Usuario.json(Map<String, dynamic> j) => Usuario(
        id: _s(j['id'] ?? j['userId']),
        nome: _s(j['name'] ?? j['userName'], 'Jogador'),
        papel: _s(j['role'], 'Customer'),
      );
}

class TorneioResumo {
  TorneioResumo({required this.id, required this.nome, required this.status, required this.rodadaAtual, this.numeroRodadas, required this.checkIn, this.modalidade});
  final String id;
  final String nome;
  final String status;
  final int rodadaAtual;
  final int? numeroRodadas;
  final bool checkIn;
  final String? modalidade;

  factory TorneioResumo.json(Map<String, dynamic> j) => TorneioResumo(
        id: _s(j['id']),
        nome: _s(j['nome'], 'Torneio'),
        status: _s(j['status']),
        rodadaAtual: _i(j['rodadaAtual']),
        numeroRodadas: _in(j['numeroRodadas']),
        checkIn: _b(j['checkIn']),
        modalidade: _sn(j['modalidade']),
      );
}

class JogadorMesa {
  JogadorMesa({required this.participanteId, required this.userId, required this.nome, this.deck, this.pokemon});
  final String participanteId;
  final String userId;
  final String nome;
  final String? deck;
  final String? pokemon;

  factory JogadorMesa.json(Map<String, dynamic> j) => JogadorMesa(
        participanteId: _s(j['participanteId']),
        userId: _s(j['userId']),
        nome: _s(j['nome'], 'Jogador'),
        deck: _sn(j['deck']),
        pokemon: _sn(j['pokemon']),
      );
}

class Mesa {
  Mesa({
    required this.partidaId, required this.mesa, required this.a, this.b, this.resultado,
    required this.divergente, required this.aguardandoMesa, required this.prontoA, required this.prontoB,
  });
  final String partidaId;
  final int mesa;
  final JogadorMesa a;
  final JogadorMesa? b;
  final String? resultado; // VitoriaA | VitoriaB | Empate
  final bool divergente;
  final bool aguardandoMesa;
  final bool prontoA;
  final bool prontoB;

  factory Mesa.json(Map<String, dynamic> j) => Mesa(
        partidaId: _s(j['partidaId']),
        mesa: _i(j['mesa']),
        a: JogadorMesa.json(_m(j['a']) ?? {}),
        b: _m(j['b']) == null ? null : JogadorMesa.json(_m(j['b'])!),
        resultado: _sn(j['resultado']),
        divergente: _b(j['divergente']),
        aguardandoMesa: _b(j['aguardandoMesa']),
        prontoA: _b(j['prontoA']),
        prontoB: _b(j['prontoB']),
      );
}

class LinhaTabela {
  LinhaTabela({required this.posicao, required this.userId, required this.nome, this.deck, required this.pontos, required this.vitorias, required this.empates, required this.derrotas, this.desistiuNaRodada});
  final int posicao;
  final String userId;
  final String nome;
  final String? deck;
  final int pontos;
  final int vitorias;
  final int empates;
  final int derrotas;
  final int? desistiuNaRodada;

  factory LinhaTabela.json(Map<String, dynamic> j) => LinhaTabela(
        posicao: _i(j['posicao']),
        userId: _s(j['userId']),
        nome: _s(j['nome'], 'Jogador'),
        deck: _sn(j['deck']),
        pontos: _i(j['pontos']),
        vitorias: _i(j['vitorias']),
        empates: _i(j['empates']),
        derrotas: _i(j['derrotas']),
        desistiuNaRodada: _in(j['desistiuNaRodada']),
      );
}

/// Relógio da rodada. A conta usa a hora do SERVIDOR (o celular pode estar fora de hora).
class TimerTorneio {
  TimerTorneio({required this.estado, required this.duracaoSegundos, this.pausadoRestante, this.iniciadoEm, this.rodada, this.agoraServidor, DateTime? recebidoEm})
      : recebidoEm = recebidoEm ?? DateTime.now().toUtc();
  final String estado; // stopped | running | paused | finished
  final int duracaoSegundos;
  final int? pausadoRestante;
  final DateTime? iniciadoEm;
  final int? rodada;
  final DateTime? agoraServidor;

  /// Quando o app recebeu a resposta (pra medir o quanto a hora do servidor difere da do aparelho).
  final DateTime recebidoEm;

  factory TimerTorneio.json(Map<String, dynamic> j) => TimerTorneio(
        estado: _s(j['state'], 'stopped'),
        duracaoSegundos: _i(j['durationSeconds']),
        pausadoRestante: _in(j['pausedRemaining']),
        iniciadoEm: DateTime.tryParse(_s(j['startedAt'])),
        rodada: _in(j['rodada']),
        agoraServidor: DateTime.tryParse(_s(j['agora'])),
      );

  /// Segundos que faltam agora, na hora do servidor.
  int? restantes() {
    switch (estado) {
      case 'paused':
        return pausadoRestante ?? duracaoSegundos;
      case 'finished':
        return 0;
      case 'running':
        if (iniciadoEm == null) return duracaoSegundos;
        final desvio = agoraServidor?.toUtc().difference(recebidoEm) ?? Duration.zero;
        final agora = DateTime.now().toUtc().add(desvio);
        final passou = agora.difference(iniciadoEm!.toUtc()).inSeconds;
        return (duracaoSegundos - passou).clamp(0, duracaoSegundos);
      default:
        return duracaoSegundos;
    }
  }
}

class TorneioPublico {
  TorneioPublico({
    required this.id, required this.nome, required this.jogo, required this.status, required this.melhorDe,
    required this.minutosRodada, this.numeroRodadas, required this.rodadaAtual, required this.mesas,
    required this.classificacao, this.timer, required this.rodadaComecou, this.modalidade,
  });
  final String id;
  final String nome;
  final String jogo;
  final String status;
  final int melhorDe;
  final int minutosRodada;
  final int? numeroRodadas;
  final int rodadaAtual;
  final List<Mesa> mesas;
  final List<LinhaTabela> classificacao;
  final TimerTorneio? timer;
  final bool rodadaComecou;
  final String? modalidade;

  factory TorneioPublico.json(Map<String, dynamic> j) {
    final timer = _m(j['timer']) == null ? null : TimerTorneio.json(_m(j['timer'])!);
    final rodadaAtual = _i(j['rodadaAtual']);
    return TorneioPublico(
      id: _s(j['id']),
      nome: _s(j['nome'], 'Torneio'),
      jogo: _s(j['jogo']),
      status: _s(j['status']),
      melhorDe: _i(j['melhorDe'], 1),
      minutosRodada: _i(j['minutosRodada']),
      numeroRodadas: _in(j['numeroRodadas']),
      rodadaAtual: rodadaAtual,
      mesas: _lista(j['mesas']).map(Mesa.json).toList(),
      classificacao: _lista(j['classificacao']).map(LinhaTabela.json).toList(),
      timer: timer,
      // Mesma regra do site (lib/api/liga.ts): marca no servidor, senão o relógio ligado nesta rodada.
      rodadaComecou: rodadaAtual != 0 &&
          (_b(j['rodadaComecou']) || (timer != null && timer.rodada == rodadaAtual && timer.estado != 'stopped')),
      modalidade: _sn(j['modalidade']),
    );
  }
}

class MinhaMesa {
  MinhaMesa({required this.torneio, this.participanteId, required this.checkIn, this.desistiuNaRodada, this.deck, this.mesa, this.meuReport, this.reportOponente});
  final TorneioPublico torneio;
  final String? participanteId;
  final bool checkIn;
  final int? desistiuNaRodada;
  final String? deck;
  final Mesa? mesa;
  final String? meuReport; // Venci | Perdi | Empatei
  final String? reportOponente;

  bool get desistiu => desistiuNaRodada != null;
  bool get souA => mesa != null && mesa!.a.participanteId == participanteId;
  JogadorMesa? get oponente => mesa == null ? null : (souA ? mesa!.b : mesa!.a);
  bool get euPronto => mesa != null && (souA ? mesa!.prontoA : mesa!.prontoB);
  bool get oponentePronto => mesa != null && (souA ? mesa!.prontoB : mesa!.prontoA);

  factory MinhaMesa.json(Map<String, dynamic> j) => MinhaMesa(
        torneio: TorneioPublico.json(_m(j['torneio']) ?? {}),
        participanteId: _sn(j['participanteId']),
        checkIn: _b(j['checkIn']),
        desistiuNaRodada: _in(j['desistiuNaRodada']),
        deck: _sn(j['deck']),
        mesa: _m(j['mesa']) == null ? null : Mesa.json(_m(j['mesa'])!),
        meuReport: _sn(j['meuReport']),
        reportOponente: _sn(j['reportOponente']),
      );
}

class RankingLinha {
  RankingLinha({required this.userId, required this.nome, required this.pontos, required this.eventos, required this.melhorColocacao, required this.decks, this.pokemon});
  final String userId;
  final String nome;
  final int pontos;
  final int eventos;
  final int melhorColocacao;
  final List<String> decks;
  final String? pokemon;

  factory RankingLinha.json(Map<String, dynamic> j) => RankingLinha(
        userId: _s(j['userId']),
        nome: _s(j['playerName'], 'Jogador'),
        pontos: _i(j['totalPoints']),
        eventos: _i(j['eventsPlayed']),
        melhorColocacao: _i(j['bestPlacement']),
        decks: (j['decks'] is List) ? (j['decks'] as List).whereType<String>().toList() : [],
        pokemon: _sn(j['pokemon']),
      );
}

class LigaMensal {
  LigaMensal({required this.ano, required this.mes, required this.rotulo, required this.ranking});
  final int ano;
  final int mes;
  final String rotulo;
  final List<RankingLinha> ranking;

  factory LigaMensal.json(Map<String, dynamic> j) => LigaMensal(
        ano: _i(j['ano']),
        mes: _i(j['mes']),
        rotulo: _s(j['mesLabel']),
        ranking: _lista(j['ranking']).map(RankingLinha.json).toList(),
      );
}

class LigaMes {
  LigaMes({required this.ano, required this.mes, required this.rotulo});
  final int ano;
  final int mes;
  final String rotulo;

  factory LigaMes.json(Map<String, dynamic> j) =>
      LigaMes(ano: _i(j['ano']), mes: _i(j['mes']), rotulo: _s(j['mesLabel']));
}

