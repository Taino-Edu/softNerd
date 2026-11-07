/// Textos amigáveis para os códigos que a API devolve.
String rotuloStatusTorneio(String status) {
  switch (status) {
    case 'Planejado':
      return 'Planejado';
    case 'Inscricoes':
      return 'Inscrições abertas';
    case 'EmAndamento':
      return 'Em andamento';
    case 'Finalizado':
      return 'Finalizado';
    case 'Cancelado':
      return 'Cancelado';
    default:
      return status;
  }
}

String rotuloModalidade(String? m) => m == 'Campeonato' ? 'Campeonato' : 'Liga';

String doisDigitos(int n) => n.toString().padLeft(2, '0');

String mmss(int segundos) => '${doisDigitos(segundos ~/ 60)}:${doisDigitos(segundos % 60)}';
