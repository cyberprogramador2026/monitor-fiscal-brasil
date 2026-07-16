import assert from "node:assert/strict";
import {
  calendarSeed,
  changeSeed,
  documentTypeLabels,
  legalStatusLabels,
  sourceSeed,
} from "./data.js";
import { createRssFeed, getRssItems } from "./rss.js";
import { confazAnnualUrlCandidates, extractConfazSummaryEntries } from "./scripts/monitor-confaz.mjs";

const stateSources = sourceSeed.filter((source) => source.category === "ESTADUAL");
const nationalSources = sourceSeed.filter((source) => source.category === "NACIONAL");
const ufSet = new Set(stateSources.map((source) => source.uf));
const sourceIds = new Set(sourceSeed.map((source) => source.id));
const changeIds = new Set(changeSeed.map((change) => change.id));

assert.equal(ufSet.size, 27, "seed deve conter 27 UFs estaduais");
assert.ok(nationalSources.length >= 10, "seed deve conter fontes nacionais");
assert.ok(sourceIds.has("nfe-notas-tecnicas"), "seed deve conter NT NF-e");
assert.ok(sourceIds.has("nfe-esquemas-xml"), "seed deve conter esquemas XML NF-e");
assert.ok(sourceIds.has("nfse-noticias"), "seed deve conter noticias NFS-e");
assert.ok(sourceIds.has("acbr-prazos-sefaz"), "seed deve conter calendario ACBr Prazos SEFAZ");
assert.ok(sourceIds.has("nfcom-svrs-documentos"), "seed deve conter documentos NFCom SVRS");
assert.ok(sourceIds.has("bpe-svrs-documentos"), "seed deve conter documentos BP-e SVRS");
assert.ok(sourceIds.has("sefaz-sp-cbenef"), "seed deve conter cBenef SP");
assert.ok(sourceIds.has("confaz-ajustes-sinief-2025"), "seed deve conter Ajustes SINIEF 2025");
assert.ok(sourceIds.has("confaz-ajustes-sinief-2026"), "seed deve conter Ajustes SINIEF 2026");
assert.ok(sourceIds.has("confaz-atos-cotepe-2025"), "seed deve conter Atos COTEPE 2025");
assert.ok(sourceIds.has("confaz-atos-cotepe-2026"), "seed deve conter Atos COTEPE 2026");
assert.ok(changeSeed.length >= 20, "seed deve conter backfill retroativo nacional");
assert.equal(documentTypeLabels.AJUSTE_SINIEF, "Ajuste SINIEF");
assert.equal(legalStatusLabels.REVOKED, "Revogado");

for (const change of changeSeed) {
  assert.ok(sourceIds.has(change.sourceId), `mudanca sem fonte: ${change.id}`);
  assert.ok(change.documents.length > 0, `mudanca sem documento: ${change.id}`);
  assert.ok(change.summary.length > 24, `resumo muito curto: ${change.id}`);
}

const dfeDistributionChange = changeSeed.find((change) => change.id === "chg-dfe-distribuicao-104");
assert.ok(dfeDistributionChange, "seed deve conter mudanca de Distribuicao DF-e");
assert.ok(
  dfeDistributionChange.documents.includes("DF-e") &&
    dfeDistributionChange.documents.includes("Distribuicao DF-e"),
  "mudanca de Distribuicao DF-e deve aparecer nos filtros de documento",
);
assert.match(
  dfeDistributionChange.evidenceUrl,
  /^https:\/\/www\.nfe\.fazenda\.gov\.br\/portal\/exibirArquivo\.aspx/,
  "mudanca de Distribuicao DF-e deve ter link direto para baixar evidencia",
);

const requiredBackfillIds = [
  "chg-nfse-cnpj-indisponibilidade-2026-07-25",
  "chg-nfse-danfse-nt008-101",
  "chg-nfse-simples-emissor-nacional",
  "chg-receita-cnpj-alfanumerico-julho",
  "chg-nfe-rtc-2025-002-150",
  "chg-nfe-cnpj-alfanum-nt-2026-004",
  "chg-cte-nt-2026-002-rtc",
  "chg-mdfe-nt-2026-001-ciot",
  "chg-nfcom-nt-2026-002-rtc",
  "chg-acbr-ajuste-sinief-09-2026-nfce-destinatario-2026-08-03",
  "chg-acbr-ajuste-sinief-10-2026-danfe-simplificado-tipo-2-2026-08-03",
  "chg-acbr-ajuste-sinief-14-2026-danfe-simplificado-contingencia-2026-08-03",
  "chg-acbr-rtc-nt-2025-002-v136-producao-2026-08-03",
  "chg-acbr-nfe-nfce-nt-2025-002-v140-producao-2026-08-03",
  "chg-acbr-dfe-nt-2026-001-producao-2026-08-03",
  "chg-acbr-danfe-simplificado-nt-2026-003-producao-2026-08-03",
  "chg-acbr-nt-2026-002-rtc-cte-nfcom-nf3e-bpe-producao-2026-08-03",
  "chg-acbr-nt-2026-002-rtc-cte-nfcom-nf3e-bpe-homologacao-2026-08-03",
  "chg-confaz-ajuste-sinief-11-25-nfce-cnpj-revogado",
  "chg-confaz-ajuste-sinief-43-25-altera-efeitos-11-25",
  "chg-confaz-ajuste-sinief-12-26-revoga-11-25",
  "chg-confaz-ato-cotepe-69-26-efd-layout-2027",
];

for (const id of requiredBackfillIds) {
  assert.ok(changeSeed.some((change) => change.id === id), `backfill ausente: ${id}`);
}

const documentSet = new Set(changeSeed.flatMap((change) => change.documents));
for (const doc of ["DANFSe", "RTC", "PAA", "CIOT", "Split Payment"]) {
  assert.ok(documentSet.has(doc), `documento retroativo ausente: ${doc}`);
}

const ajusteSinief11 = changeSeed.find(
  (change) => change.id === "chg-confaz-ajuste-sinief-11-25-nfce-cnpj-revogado",
);
assert.ok(ajusteSinief11, "seed deve conter Ajuste SINIEF 11/25");
assert.equal(ajusteSinief11.documentType, "AJUSTE_SINIEF");
assert.equal(ajusteSinief11.legalStatus, "REVOKED");
assert.equal(ajusteSinief11.hasTechnicalNote, false);
assert.equal(ajusteSinief11.normativeBeforeTechnicalNote, true);
assert.ok(ajusteSinief11.laterAlteredBy.includes("Ajuste SINIEF 12/26"));
assert.ok(ajusteSinief11.products.includes("Gerencie Aqui"));

const atoCotepe69 = changeSeed.find((change) => change.id === "chg-confaz-ato-cotepe-69-26-efd-layout-2027");
assert.ok(atoCotepe69, "seed deve conter Ato COTEPE/ICMS 69/26");
assert.equal(atoCotepe69.documentType, "ATO_COTEPE_ICMS");
assert.equal(atoCotepe69.effectsDate, "2027-01-01");
assert.equal(atoCotepe69.hasTechnicalNote, true);

const ajusteUrls = confazAnnualUrlCandidates("AJUSTE_SINIEF", 2026);
assert.deepEqual(ajusteUrls, [
  "https://www.confaz.fazenda.gov.br/legislacao/ajustes/2026",
  "https://www.confaz.fazenda.gov.br/legislacao/ajustes/2026/2026",
]);

const sampleEntries = extractConfazSummaryEntries(
  `
    <h1>AJUSTES SINIEF 2026</h1>
    <p>SUMARIO</p>
    <a href="/legislacao/ajustes/2026/AJ012_26">012</a>
    Revoga o Ajuste SINIEF no 11, de 29 de abril de 2025.
    <a href="/legislacao/ajustes/2026/AJ013_26">013</a>
    Altera o Ajuste SINIEF no 12, de 29 de abril de 2025.
  `,
  {
    kind: "AJUSTE_SINIEF",
    year: 2026,
    url: "https://www.confaz.fazenda.gov.br/legislacao/ajustes/2026/2026",
    sourceName: "CONFAZ - Ajustes SINIEF 2026",
  },
);
assert.equal(sampleEntries.length, 2, "parser deve extrair itens do sumario CONFAZ");
assert.equal(sampleEntries[0].documentNumber, "12/26");
assert.match(sampleEntries[0].officialUrl, /AJ012_26$/);

const nfseCnpjOutage = changeSeed.find(
  (change) => change.id === "chg-nfse-cnpj-indisponibilidade-2026-07-25",
);
assert.ok(nfseCnpjOutage, "seed deve conter indisponibilidade CNPJ NFS-e");
assert.equal(nfseCnpjOutage.sourceId, "nfse-noticias");
assert.equal(nfseCnpjOutage.effectiveDate, "2026-07-25");
assert.match(nfseCnpjOutage.evidenceUrl, /^https:\/\/www\.gov\.br\/nfse\/pt-br\/noticias\//);

for (const event of calendarSeed) {
  assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(sourceIds.has(event.sourceId), `evento sem fonte: ${event.id}`);
  assert.ok(changeIds.has(event.changeId), `evento sem mudanca vinculada: ${event.id}`);
  const change = changeSeed.find((item) => item.id === event.changeId);
  assert.ok(
    event.date === change.effectiveDate || event.date === change.productionDate,
    `evento fora da data operacional: ${event.id}`,
  );
  assert.doesNotMatch(event.title, /^Vigencia: (triagem|validar|analise|sincronizar|revisao)\b/i);
}

const nfseCnpjOutageEvent = calendarSeed.find(
  (event) => event.changeId === "chg-nfse-cnpj-indisponibilidade-2026-07-25",
);
assert.ok(nfseCnpjOutageEvent, "calendario deve conter indisponibilidade CNPJ NFS-e");
assert.equal(nfseCnpjOutageEvent.date, "2026-07-25");
assert.match(nfseCnpjOutageEvent.title, /^Indisponibilidade:/);

const acbrAugust3Events = calendarSeed.filter(
  (event) => event.sourceId === "acbr-prazos-sefaz" && event.date === "2026-08-03",
);
assert.equal(acbrAugust3Events.length, 9, "calendario deve conter 9 prazos ACBr em 03/08/2026");
assert.ok(
  acbrAugust3Events.some((event) => /NT 2025\.002 v1\.40/.test(event.title)),
  "calendario deve conter NT 2025.002 v1.40 em 03/08/2026",
);
assert.ok(
  acbrAugust3Events.some((event) => /^Homologacao: NT 2026\.002/.test(event.title)),
  "calendario deve diferenciar homologacao ACBr em 03/08/2026",
);

const rssItems = getRssItems();
assert.ok(rssItems.length > 0, "RSS deve conter avisos");
assert.ok(
  rssItems.every(({ change }) => change.status !== "IGNORED"),
  "RSS nao deve publicar avisos ignorados",
);
assert.equal(
  rssItems[0].change.id,
  "chg-confaz-ajuste-sinief-11-25-nfce-cnpj-revogado",
  "RSS deve priorizar a mudanca mais recente por deteccao",
);

const rssFeed = createRssFeed({ siteUrl: "https://example.com", selfPath: "/feed.xml" });
assert.match(rssFeed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.match(rssFeed, /<rss version="2\.0"/);
assert.match(rssFeed, /<atom:link href="https:\/\/example\.com\/feed\.xml"/);
assert.match(rssFeed, /https:\/\/example\.com\/#avisos\/chg-nfse-danfse-nt008-101/);
assert.doesNotMatch(rssFeed, /monitor-fiscal-brasil:chg-sped-institucional/);

const githubPagesFeed = createRssFeed({
  siteUrl: "https://cyberprogramador2026.github.io/monitor-fiscal-brasil/",
  selfPath: "/feed.xml",
});
assert.match(
  githubPagesFeed,
  /https:\/\/cyberprogramador2026\.github\.io\/monitor-fiscal-brasil\/feed\.xml/,
);
assert.match(
  githubPagesFeed,
  /https:\/\/cyberprogramador2026\.github\.io\/monitor-fiscal-brasil\/#avisos\/chg-nfse-danfse-nt008-101/,
);

console.log("Seed fiscal validado.");
