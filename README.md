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

## Comandos

```bash
npm run dev
npm run lint
npm test
npm run build
```

O build nao depende de pacotes externos. Ele gera um artefato compativel com Sites em uma pasta temporaria do sistema, incluindo `dist/server/index.js`, `dist/client/**` e `dist/.openai/hosting.json`.

## RSS

O feed principal fica em `/feed.xml` e tambem responde em `/rss.xml`. Ele publica os avisos nao ignorados, ordenados pela data de deteccao, com link direto para o detalhe do aviso no monitor e referencia para a fonte oficial na descricao.

Para publicar no GitHub Pages em `https://cyberprogramador2026.github.io/monitor-fiscal-brasil/`, gere os arquivos estaticos antes do commit:

```bash
npm run rss:generate
```

## Variaveis previstas

Veja `.env.example`. O MVP estatico nao usa chaves reais, mas o desenho ja reserva as variaveis para a evolucao com banco, fila, IA e notificacoes.

## Proximas etapas tecnicas

1. Trocar armazenamento local por PostgreSQL/Prisma ou D1.
2. Implementar worker horario com fila, rate limit e snapshots persistentes.
3. Integrar fetchers HTML/PDF, normalizacao, hash e diff real.
4. Conectar classificacao via OpenAI API com revisao humana para alta e critica.
5. Habilitar notificacoes por webhook, e-mail, Teams ou Slack.
