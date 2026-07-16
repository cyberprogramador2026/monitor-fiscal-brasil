# Runbook Operacional

| Situacao | Acao |
| --- | --- |
| Portal fora do ar | Registrar erro, tentar novamente com backoff e nao gerar aviso fiscal. |
| Mudanca visual irrelevante | Classificar como baixa e permitir ignorar mantendo historico. |
| Nova NT ou schema | Classificar como alta ou critica, enviar para revisao e notificar Dev/Fiscal. |
| Novo Ajuste SINIEF ou Ato COTEPE/ICMS com DF-e | Classificar impacto, vincular documentos relacionados e enviar para Produto/Fiscal/Dev. |
| Alteracao normativa sem Nota Tecnica | Marcar "Alteracao normativa identificada antes da Nota Tecnica" e antecipar analise de Produto e Desenvolvimento. |
| Retificacao, republicacao ou revogacao CONFAZ | Manter versoes anteriores, atualizar situacao legal e criar diff Antes/Depois. |
| Mudanca em cBenef | Classificar como alta para a UF correspondente e NF-e/NFC-e. |
| Mudanca em webservice | Classificar como critica quando afetar producao ou homologacao. |
| Erro recorrente de coleta | Marcar fonte como instavel e abrir tarefa de manutencao. |

## Regras de publicacao

- Critica: revisao humana obrigatoria e notificacao imediata.
- Alta: revisao Fiscal/Dev/Suporte/CS antes de comunicacao ampla.
- Media: acompanhamento normal com historico auditavel.
- Baixa: rascunho ou ignorada sem apagar snapshots.
