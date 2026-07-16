# Monitor Fiscal Brasil

Aplicacao web para centralizar avisos de mudancas fiscais, calendario fiscal e fontes oficiais monitoradas para a Soften Sistemas.

## MVP entregue

- Dashboard operacional com metricas, fila priorizada, distribuicao por criticidade e cobertura das 27 UFs.
- Lista de avisos com filtros por busca, UF, documento, criticidade e status.
- Detalhe do aviso com resumo IA, impacto operacional, acao sugerida, diff e link oficial.
- Calendario mensal com eventos manuais e mudancas detectadas.
- Painel de fontes com seed nacional e estadual baseado na especificacao.
- Fila de revisao para publicar ou ignorar mudancas.
- Simulacao de verificacao manual e exportacao CSV no navegador.
- Feed RSS em `/feed.xml` e `/rss.xml` para acompanhar avisos fiscais em leitores RSS.
- Fontes anuais CONFAZ para Ajustes SINIEF e Atos COTEPE/ICMS, com situacao legal, produtos, vinculos e sinalizacao de ato sem Nota Tecnica.

## Comandos

```bash
npm run dev
npm run lint
npm test
npm run build
npm run analyze:pdfs
npm run monitor:confaz
```

O build nao depende de pacotes externos. Ele gera um artefato compativel com Sites em uma pasta temporaria do sistema, incluindo `dist/server/index.js`, `dist/client/**` e `dist/.openai/hosting.json`.

## RSS

O feed principal fica em `/feed.xml` e tambem responde em `/rss.xml`. Ele publica os avisos nao ignorados, ordenados pela data de deteccao, com link direto para o detalhe do aviso no monitor e referencia para a fonte oficial na descricao.

Para publicar no GitHub Pages em `https://cyberprogramador2026.github.io/monitor-fiscal-brasil/`, gere os arquivos estaticos antes do commit:

```bash
npm run rss:generate
```

## Analise de PDFs

O comando `npm run analyze:pdfs` baixa PDFs tecnicos encontrados nas fontes monitoradas e nos links de evidencia ja cadastrados, extrai texto com `pdfplumber` e gera candidatos de prazos e mudancas em Markdown e JSON.

Por padrao, a analise usa uma pasta temporaria do sistema e nao altera os dados publicados do monitor. Ajustes uteis:

```bash
PDF_ANALYZER_MAX_PDFS=10 npm run analyze:pdfs
PDF_ANALYZER_MAX_PAGES=80 npm run analyze:pdfs
PDF_ANALYZER_OUTPUT_DIR=./output/pdf npm run analyze:pdfs
PDF_ANALYZER_PYTHON=/caminho/para/python npm run analyze:pdfs
```

O relatorio aponta datas de homologacao, producao, vigencia, obrigatoriedade, indisponibilidade e trechos com alteracoes de leiaute, schemas, campos, regras de validacao e rejeicoes. Esses itens devem ser revisados antes de virar aviso publicado.

## Monitoramento CONFAZ

O comando `npm run monitor:confaz` consulta as paginas anuais de Ajustes SINIEF e Atos COTEPE/ICMS do CONFAZ para o ano anterior, atual e seguinte quando a pagina existir. Ele identifica publicacoes, retificacoes, republicacoes, revogacoes, alteracoes de vigencia, documentos afetados, produtos impactados, relacao com Nota Tecnica e alerta de alteracao normativa sem NT.

Por padrao, o relatorio e os snapshots ficam em uma pasta temporaria. Ajustes uteis:

```bash
CONFAZ_MONITOR_YEARS=2025,2026 npm run monitor:confaz
CONFAZ_MONITOR_OUTPUT_DIR=./output/confaz npm run monitor:confaz
CONFAZ_MONITOR_MAX_DETAILS=200 npm run monitor:confaz
```

Observacao operacional: o portal CONFAZ usa `/legislacao/atos/{ano}` para Atos COTEPE/ICMS. Para Ajustes SINIEF, o coletor tenta `/legislacao/ajustes/{ano}` e tambem a variante publicada em 2026, `/legislacao/ajustes/{ano}/{ano}`.

## Variaveis previstas

Veja `.env.example`. O MVP estatico nao usa chaves reais, mas o desenho ja reserva as variaveis para a evolucao com banco, fila, IA e notificacoes.

## Proximas etapas tecnicas

1. Trocar armazenamento local por PostgreSQL/Prisma ou D1.
2. Implementar worker horario com fila, rate limit e snapshots persistentes.
3. Integrar fetchers HTML/PDF, normalizacao, hash e diff real.
4. Conectar classificacao via OpenAI API com revisao humana para alta e critica.
5. Habilitar notificacoes por webhook, e-mail, Teams ou Slack.
