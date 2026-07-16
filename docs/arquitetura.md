# Arquitetura

## Visao MVP

O MVP atual e uma aplicacao estatica com dados versionados, estado no navegador e build de Worker ESM para publicacao. Ele entrega a experiencia operacional inicial sem depender de banco ou fila.

## Evolucao recomendada

- Frontend: Next.js, TypeScript e Tailwind.
- API: rotas para fontes, avisos, verificacoes, calendario e importacao.
- Worker: job horario com fila, prioridade por criticidade, retries e rate limit.
- Banco: modelo Source, SourceSnapshot, ChangeEvent, FiscalCalendarEvent e NotificationLog.
- IA: classificacao de documento, UF, tema, criticidade, resumo e acao sugerida.
- Auditoria: snapshots imutaveis, diff persistido e log estruturado por verificacao.
- Coleta legal CONFAZ: `scripts/monitor-confaz.mjs` ja normaliza paginas anuais, textos integrais, hash, diff simples, situacao legal e alerta de ato sem Nota Tecnica.

## Fluxo alvo

1. Scheduler executa `0 * * * *`.
2. Fontes ativas com proxima verificacao vencida entram na fila.
3. Worker coleta HTML, PDF ou lista de arquivos.
4. Normalizador remove elementos dinamicos, extrai texto de PDFs tecnicos ou atos legais HTML e calcula hash.
5. Mudanca real gera snapshot, diff, candidatos de prazo, relacao normativa e classificacao por IA.
6. Alta ou critica fica em revisao humana antes de publicar.
7. Avisos publicados entram no calendario e notificam os times.

## Fluxo CONFAZ alvo

1. Scheduler diario executa o monitor de Ajustes SINIEF e Atos COTEPE/ICMS para ano anterior, atual e proximo ano publicado.
2. Sumarios anuais geram candidatos de publicacao, retificacao e republicacao.
3. Cada URL oficial e baixada, normalizada, classificada e comparada com o ultimo snapshot.
4. Alteracoes com documento fiscal, vigencia, revogacao, nova redacao ou impacto alto geram `ChangeEvent`.
5. Eventos sem Nota Tecnica relacionada recebem a sinalizacao "Alteracao normativa identificada antes da Nota Tecnica".
6. Documentos original, alterador e posteriores sao vinculados para formar a linha do tempo legal -> tecnica -> schema -> homologacao -> producao.
