# Fontes Monitoradas

O seed inicial da aplicacao inclui:

- Fontes nacionais: Portal NF-e, CT-e, MDF-e/SVRS, NFS-e Nacional, Receita Federal, CONFAZ, SPED e NFCom.
- Fontes estaduais: 27 UFs com portal principal ou URL prioritaria de documentos fiscais eletronicos.
- Frequencia inicial: horaria para fontes criticas e diaria/semanal para menor criticidade.
- CONFAZ anual: Ajustes SINIEF 2025/2026 e Atos COTEPE/ICMS 2025/2026, com frequencia diaria, tipo de publicacao, ano, situacao legal e vinculos entre atos.

As URLs ficam em `assets/data.js` no MVP e devem migrar para a tabela `Source` quando houver backend persistente.

## CONFAZ

- Ajustes SINIEF: tentar `https://www.confaz.fazenda.gov.br/legislacao/ajustes/{ano}` e, quando necessario, `https://www.confaz.fazenda.gov.br/legislacao/ajustes/{ano}/{ano}`.
- Atos COTEPE/ICMS: usar `https://www.confaz.fazenda.gov.br/legislacao/atos/{ano}`.
- Escopo minimo diario: ano anterior, ano atual e ano seguinte quando publicado.
- Secoes relevantes: sumario principal, ajustes/atos em sistematizacao, retificacoes e republicacoes.
- Comparacao: manter snapshot de texto normalizado por URL oficial e gerar diff quando o hash mudar.
