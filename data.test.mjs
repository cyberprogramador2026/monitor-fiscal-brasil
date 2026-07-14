import assert from "node:assert/strict";
import { calendarSeed, changeSeed, sourceSeed } from "./data.js";
import { createRssFeed, getRssItems } from "./rss.js";

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
assert.ok(sourceIds.has("nfcom-svrs-documentos"), "seed deve conter documentos NFCom SVRS");
assert.ok(sourceIds.has("bpe-svrs-documentos"), "seed deve conter documentos BP-e SVRS");
assert.ok(sourceIds.has("sefaz-sp-cbenef"), "seed deve conter cBenef SP");
assert.ok(changeSeed.length >= 20, "seed deve conter backfill retroativo nacional");

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
];

for (const id of requiredBackfillIds) {
  assert.ok(changeSeed.some((change) => change.id === id), `backfill ausente: ${id}`);
}

const documentSet = new Set(changeSeed.flatMap((change) => change.documents));
for (const doc of ["DANFSe", "RTC", "PAA", "CIOT", "Split Payment"]) {
  assert.ok(documentSet.has(doc), `documento retroativo ausente: ${doc}`);
}

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
  assert.equal(event.date, change.effectiveDate, `evento fora da vigencia: ${event.id}`);
  assert.doesNotMatch(event.title, /^Vigencia: (triagem|validar|analise|sincronizar|revisao)\b/i);
}

const rssItems = getRssItems();
assert.ok(rssItems.length > 0, "RSS deve conter avisos");
assert.ok(
  rssItems.every(({ change }) => change.status !== "IGNORED"),
  "RSS nao deve publicar avisos ignorados",
);
assert.equal(
  rssItems[0].change.id,
  "chg-nfse-cnpj-indisponibilidade-2026-07-25",
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
