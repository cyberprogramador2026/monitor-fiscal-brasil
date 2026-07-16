import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = resolve(
  process.env.CONFAZ_MONITOR_OUTPUT_DIR ?? join(tmpdir(), "monitor-fiscal-brasil-confaz"),
);
const snapshotPath = resolve(
  process.env.CONFAZ_MONITOR_SNAPSHOT_PATH ?? join(outputDir, "confaz-snapshots.json"),
);
const reportJsonPath = join(outputDir, "confaz-monitor-report.json");
const reportMarkdownPath = join(outputDir, "confaz-monitor-report.md");
const maxDetails = Number(process.env.CONFAZ_MONITOR_MAX_DETAILS ?? 80);

const confazBase = "https://www.confaz.fazenda.gov.br";
const documentKeywords = [
  ["NF-e", /\bNF-?e\b|Nota Fiscal Eletr[oÃ´]nica|modelo 55/i],
  ["NFC-e", /\bNFC-?e\b|Nota Fiscal de Consumidor Eletr[oÃ´]nica|modelo 65/i],
  ["CT-e", /\bCT-?e\b|Conhecimento de Transporte Eletr[oÃ´]nico/i],
  ["CT-e OS", /\bCT-?e OS\b/i],
  ["MDF-e", /\bMDF-?e\b|Manifesto Eletr[oÃ´]nico de Documentos Fiscais/i],
  ["NFS-e", /\bNFS-?e\b|Nota Fiscal de Servi[cÃ§]os Eletr[oÃ´]nica/i],
  ["NFCom", /\bNFCom\b|Nota Fiscal Fatura de Servi[cÃ§]os de Comunica[cÃ§][aÃ£]o/i],
  ["NF3e", /\bNF3e\b|Nota Fiscal de Energia El[eÃ©]trica Eletr[oÃ´]nica/i],
  ["BP-e", /\bBP-?e\b|Bilhete de Passagem Eletr[oÃ´]nico/i],
  ["GTV-e", /\bGTV-?e\b/i],
  ["DC-e", /\bDC-?e\b|Declara[cÃ§][aÃ£]o de Conte[uÃº]do eletr[oÃ´]nica/i],
  ["DF-e", /\bDF-?e\b|Documento Fiscal Eletr[oÃ´]nico|documentos fiscais eletr[oÃ´]nicos/i],
  ["EFD", /\bEFD\b|Escritura[cÃ§][aÃ£]o Fiscal Digital|SPED Fiscal/i],
  ["XML", /\bXML\b|schema|leiaute|layout|campo|grupo|tag|regra de valida[cÃ§][aÃ£]o|rejei[cÃ§][aÃ£]o/i],
];
const reformTaxPattern =
  /\b(IBS|CBS|Imposto Seletivo|Reforma Tribut[aÃ¡]ria|Lei Complementar n[Âºo. ]+214|Comit[eÃª] Gestor|nota de d[eÃ©]bito|nota de cr[eÃ©]dito|cr[eÃ©]dito presumido|monof[aÃ¡]sico|diferimento|redu[cÃ§][aÃ£]o de al[iÃ­]quota)\b/i;
const highImpactPattern =
  /\b(obrigatoriedade|obrigat[oÃ³]rio|fica revogado|revoga|passa a vigorar|produzindo efeitos|ambiente de produ[cÃ§][aÃ£]o|schema|leiaute|regra de valida[cÃ§][aÃ£]o|rejei[cÃ§][aÃ£]o|campo obrigat[oÃ³]rio|modelo 55|modelo 65)\b/i;
const mediumImpactPattern =
  /\b(procedimento|manual|orienta[cÃ§][aÃ£]o|evento|retifica[cÃ§][aÃ£]o|republica[cÃ§][aÃ£]o|altera)\b/i;
const mutationPattern =
  /\b(Nova reda[cÃ§][aÃ£]o|Reda[cÃ§][aÃ£]o anterior|Efeitos at[eÃ©]|Efeitos a partir de|Fica revogado|Fica acrescido|Passa a vigorar|Alterado pelo Ajuste|Alterado pelo Ato COTEPE|Retificado no DOU|Republicado no DOU)\b/i;

const monthNumbers = new Map(
  [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ].map((month, index) => [month, String(index + 1).padStart(2, "0")]),
);

function normalizeForKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return stripTags(value)
    .replace(/\bTweet\b/gi, " ")
    .replace(/\bImprimir\b/gi, " ")
    .replace(/\bVoltar para o topo\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentHash(value) {
  return createHash("sha256").update(normalizeText(value)).digest("hex");
}

function parsePtDate(value, fallbackYear) {
  const text = String(value ?? "").trim().toLowerCase();
  const numeric = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }

  const named = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de)?\s+(\d{2,4})?\b/);
  if (!named) return "";

  const year = named[3] ? (named[3].length === 2 ? `20${named[3]}` : named[3]) : String(fallbackYear);
  return `${year}-${monthNumbers.get(named[2])}-${named[1].padStart(2, "0")}`;
}

export function monitoredConfazYears(referenceDate = new Date()) {
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(
      referenceDate,
    ),
  );
  return [year - 1, year, year + 1];
}

export function confazAnnualUrlCandidates(kind, year) {
  if (kind === "AJUSTE_SINIEF") {
    return [
      `${confazBase}/legislacao/ajustes/${year}`,
      `${confazBase}/legislacao/ajustes/${year}/${year}`,
    ];
  }

  return [`${confazBase}/legislacao/atos/${year}`];
}

function sourceFor(kind, year, url) {
  return {
    kind,
    year,
    url,
    documentType: kind,
    sourceName:
      kind === "AJUSTE_SINIEF" ? `CONFAZ - Ajustes SINIEF ${year}` : `CONFAZ - Atos COTEPE/ICMS ${year}`,
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "MonitorFiscalBrasil/0.1 CONFAZ monitor",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (/require_login|cookies n[aÃ£]o est[aÃ£]o habilitados|Nome do Usu[aÃ¡]rio/i.test(html)) {
    throw new Error("pagina retornou tela restrita/login");
  }
  return html;
}

async function fetchFirstAvailable(urls) {
  const errors = [];
  for (const url of urls) {
    try {
      return { url, html: await fetchHtml(url) };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join("; "));
}

function documentNumberFromEntry(kind, label, href, year) {
  const labelMatch = label.match(/(\d{1,3})\s*\/\s*(\d{2})/);
  if (labelMatch) return `${Number(labelMatch[1])}/${labelMatch[2]}`;

  const hrefMatch = href.match(/(?:AJ|ato-cotepe-icms-)(\d{1,3})[_-](\d{2})/i);
  if (hrefMatch) return `${Number(hrefMatch[1])}/${hrefMatch[2]}`;

  const summaryNumber = label.match(/\b(\d{1,3})\b/);
  if (summaryNumber) return `${Number(summaryNumber[1])}/${String(year).slice(-2)}`;

  return "";
}

function normalizeOfficialUrl(href, baseUrl) {
  try {
    return new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    return "";
  }
}

export function extractConfazSummaryEntries(html, source) {
  const summaryStart = html.search(/SUM[ÁA]RIO|SUM&Aacute;RIO/i);
  const scopedHtml = summaryStart >= 0 ? html.slice(summaryStart) : html;
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = [...scopedHtml.matchAll(anchorPattern)];
  const entries = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const [raw, href, rawLabel] = anchors[index];
    const label = stripTags(rawLabel);
    const afterAnchorIndex = (anchors[index].index ?? 0) + raw.length;
    const nextAnchorIndex = anchors[index + 1]?.index ?? scopedHtml.length;
    const officialUrl = normalizeOfficialUrl(href, source.url);
    const ementa = stripTags(scopedHtml.slice(afterAnchorIndex, nextAnchorIndex));
    const combined = `${label} ${ementa}`;
    const isExpectedKind =
      source.kind === "AJUSTE_SINIEF"
        ? /ajuste\s+sinief|\b\d{1,3}\b|retifica/i.test(combined)
        : /ato\s+cotepe|^\d{1,3}$|retifica|republica/i.test(label);

    if (!officialUrl || !isExpectedKind || !documentNumberFromEntry(source.kind, label, officialUrl, source.year)) {
      continue;
    }

    const documentNumber = documentNumberFromEntry(source.kind, label, officialUrl, source.year);
    const documentName = source.kind === "AJUSTE_SINIEF" ? "Ajuste SINIEF" : "Ato COTEPE/ICMS";
    entries.push({
      id: `${source.kind.toLowerCase()}-${documentNumber.replace("/", "-")}`,
      documentType: source.kind,
      documentNumber,
      documentYear: source.year,
      title: `${documentName} ${documentNumber}`,
      ementa,
      officialUrl,
      sourceUrl: source.url,
      sourceName: source.sourceName,
      section:
        /republica/i.test(combined) ? "REPUBLICACAO" : /retifica/i.test(combined) ? "RETIFICACAO" : "ATOS",
    });
  }

  return entries.filter((entry, index, list) => {
    const key = `${entry.documentType}:${entry.documentNumber}:${entry.section}:${entry.officialUrl}`;
    return list.findIndex((candidate) => `${candidate.documentType}:${candidate.documentNumber}:${candidate.section}:${candidate.officialUrl}` === key) === index;
  });
}

function extractDateFields(text, year) {
  const publicationMatch = text.match(/Publica[cÃ§][aÃ£]o no DOU de\s+([0-9./-]+)/i) ??
    text.match(/Publicado no DOU de\s+([0-9./-]+)/i);
  const effectsMatch =
    text.match(/produzindo efeitos a partir de\s+([^.;\n]+)/i) ??
    text.match(/efeitos a partir de\s+([^.;\n]+)/i);
  const effectiveMatch = text.match(/entra em vigor[^.;\n]*(?:em|na data de)?\s*([^.;\n]*)/i);

  return {
    douPublicationDate: publicationMatch ? parsePtDate(publicationMatch[1], year) : "",
    effectsDate: effectsMatch ? parsePtDate(effectsMatch[1], year) : "",
    effectiveDate: effectiveMatch ? parsePtDate(effectiveMatch[1], year) : "",
  };
}

function detectDocuments(text) {
  const docs = documentKeywords
    .filter(([, pattern]) => pattern.test(text))
    .map(([document]) => document);
  if (!docs.length && /\bICMS\b/i.test(text)) docs.push("ICMS");
  return [...new Set(docs)];
}

function detectLegalStatus(text, effectiveDate) {
  if (/revogad[ao]|fica revogado/i.test(text)) return "REVOKED";
  if (/retifica[cÃ§][aÃ£]o|retificado/i.test(text)) return "RECTIFIED";
  if (/republica[cÃ§][aÃ£]o|republicado/i.test(text)) return "RECTIFIED";
  if (/adiad|prorrog/i.test(text)) return "POSTPONED";
  if (/altera|nova reda[cÃ§][aÃ£]o|passa a vigorar/i.test(text)) return "CHANGED";
  if (effectiveDate && effectiveDate > new Date().toISOString().slice(0, 10)) return "FUTURE_EFFECTIVE";
  return "PUBLISHED";
}

function detectImpact(text) {
  if (highImpactPattern.test(text) || reformTaxPattern.test(text)) return "HIGH";
  if (mediumImpactPattern.test(text)) return "MEDIUM";
  return "LOW";
}

function detectProducts(documents, text) {
  const products = new Set();
  for (const document of documents) {
    if (["NF-e", "NFC-e", "CT-e", "CT-e OS", "MDF-e", "NFS-e", "NFCom", "NF3e", "BP-e"].includes(document)) {
      products.add(document);
    }
  }
  if (documents.some((document) => ["NF-e", "NFC-e", "DF-e"].includes(document))) {
    products.add("Gerencie Aqui");
    products.add("SIEM");
  }
  if (documents.includes("EFD") || /SPED|EFD/i.test(text)) products.add("EFD");
  if (/integra[cÃ§][oÃµ]es?|XML|schema/i.test(text)) products.add("Integracoes");
  return [...products];
}

function detectRelatedDocuments(text) {
  const pattern =
    /\b(?:Ajuste SINIEF|Ato COTEPE\/ICMS|Conv[eÃª]nio ICMS|Protocolo ICMS|Nota T[eÃ©]cnica(?: EFD ICMS IPI)?)\s*(?:n[Âºo.]*)?\s*\d{1,4}[./]\d{2,4}(?:\s*v\d+(?:\.\d+)*)?/gi;
  return [...new Set([...text.matchAll(pattern)].map((match) => match[0].replace(/\s+/g, " ").trim()))];
}

function detectTechnicalNote(text) {
  const match = text.match(/Nota T[eÃ©]cnica(?: EFD ICMS IPI)?\s*(?:n[Âºo.]*)?\s*\d{4}[./]\d{3}(?:\s*v\d+(?:\.\d+)*)?/i);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? "";
}

function classifyEntry(entry, detailText = "") {
  const text = `${entry.title}. ${entry.ementa}. ${detailText}`;
  const dates = extractDateFields(text, entry.documentYear);
  const documents = detectDocuments(text);
  const technicalNote = detectTechnicalNote(text);
  const relatedDocuments = detectRelatedDocuments(text).filter(
    (document) => !document.includes(entry.documentNumber),
  );
  const legalStatus = detectLegalStatus(text, dates.effectsDate || dates.effectiveDate);
  const severity = detectImpact(text);

  return {
    ...entry,
    ementa: entry.ementa || "",
    fullText: detailText,
    contentHash: contentHash(detailText || entry.ementa || entry.title),
    publicationDate: dates.douPublicationDate,
    douPublicationDate: dates.douPublicationDate,
    effectiveDate: dates.effectiveDate || dates.effectsDate,
    effectsDate: dates.effectsDate,
    legalStatus,
    subjectMain: reformTaxPattern.test(text) ? "Reforma Tributaria" : entry.ementa,
    documents: documents.length ? documents : ["ICMS"],
    products: detectProducts(documents, text),
    relatedDocuments,
    originalDocument: relatedDocuments[0] ?? "",
    hasTechnicalNote: Boolean(technicalNote),
    technicalNoteRelated: technicalNote || "Aguardando identificacao ou vinculacao",
    normativeBeforeTechnicalNote:
      !technicalNote && ["AJUSTE_SINIEF", "ATO_COTEPE_ICMS"].includes(entry.documentType) && documents.length > 0,
    alertFlag:
      !technicalNote && ["AJUSTE_SINIEF", "ATO_COTEPE_ICMS"].includes(entry.documentType) && documents.length > 0
        ? "Alteracao normativa identificada antes da Nota Tecnica"
        : "",
    hasMutationMarkers: mutationPattern.test(text),
    severity,
  };
}

function diffSnippet(previousText, currentText) {
  const previousLines = new Set(normalizeText(previousText).split(/(?<=\.)\s+/).filter(Boolean));
  const currentLines = normalizeText(currentText).split(/(?<=\.)\s+/).filter(Boolean);
  const added = currentLines.find((line) => !previousLines.has(line)) ?? "";
  const removed =
    normalizeText(previousText)
      .split(/(?<=\.)\s+/)
      .find((line) => line && !currentLines.includes(line)) ?? "";
  return {
    before: removed.slice(0, 500),
    after: added.slice(0, 500),
  };
}

async function loadSnapshots() {
  if (!existsSync(snapshotPath)) return {};
  return JSON.parse(await readFile(snapshotPath, "utf8"));
}

async function saveSnapshots(snapshots) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshots, null, 2)}\n`);
}

async function collectAnnualSource(kind, year) {
  const { url, html } = await fetchFirstAvailable(confazAnnualUrlCandidates(kind, year));
  const source = sourceFor(kind, year, url);
  return extractConfazSummaryEntries(html, source);
}

async function hydrateDetails(entries) {
  const hydrated = [];
  for (const entry of entries.slice(0, maxDetails)) {
    try {
      hydrated.push(classifyEntry(entry, normalizeText(await fetchHtml(entry.officialUrl))));
    } catch (error) {
      hydrated.push({ ...classifyEntry(entry), error: error.message });
    }
  }
  return [...hydrated, ...entries.slice(maxDetails).map((entry) => classifyEntry(entry))];
}

function yearsFromEnv() {
  if (process.env.CONFAZ_MONITOR_YEARS) {
    return process.env.CONFAZ_MONITOR_YEARS.split(",")
      .map((year) => Number(year.trim()))
      .filter(Boolean);
  }
  return monitoredConfazYears(new Date(process.env.CONFAZ_MONITOR_REFERENCE_DATE ?? Date.now()));
}

async function buildReport() {
  const snapshots = await loadSnapshots();
  const years = yearsFromEnv();
  const sourceErrors = [];
  const summaryEntries = [];

  for (const year of years) {
    for (const kind of ["AJUSTE_SINIEF", "ATO_COTEPE_ICMS"]) {
      try {
        summaryEntries.push(...(await collectAnnualSource(kind, year)));
      } catch (error) {
        sourceErrors.push({ kind, year, error: error.message });
      }
    }
  }

  const publications = await hydrateDetails(summaryEntries);
  const now = new Date().toISOString();
  const withDiffs = publications.map((publication) => {
    const previous = snapshots[publication.officialUrl];
    const changed = previous ? previous.contentHash !== publication.contentHash : true;
    const diff = previous && changed ? diffSnippet(previous.fullText ?? "", publication.fullText ?? "") : null;
    snapshots[publication.officialUrl] = {
      contentHash: publication.contentHash,
      fullText: publication.fullText,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : previous?.lastChangedAt ?? now,
    };
    return {
      ...publication,
      changed,
      lastCheckedAt: now,
      lastChangedAt: snapshots[publication.officialUrl].lastChangedAt,
      diffBefore: diff?.before ?? "",
      diffAfter: diff?.after ?? "",
    };
  });

  await saveSnapshots(snapshots);

  return {
    generatedAt: now,
    monitoredYears: years,
    sourceErrors,
    totals: {
      publications: withDiffs.length,
      changed: withDiffs.filter((item) => item.changed).length,
      highImpact: withDiffs.filter((item) => item.severity === "HIGH").length,
      normativeBeforeTechnicalNote: withDiffs.filter((item) => item.normativeBeforeTechnicalNote).length,
    },
    publications: withDiffs,
  };
}

function reportToMarkdown(report) {
  const lines = [
    "# Relatorio CONFAZ",
    "",
    `Gerado em: ${report.generatedAt}`,
    `Anos monitorados: ${report.monitoredYears.join(", ")}`,
    `Publicacoes: ${report.totals.publications}`,
    `Alteradas/novas: ${report.totals.changed}`,
    `Impacto alto: ${report.totals.highImpact}`,
    `Sem NT vinculada: ${report.totals.normativeBeforeTechnicalNote}`,
    "",
    "## Alertas",
  ];

  const alerts = report.publications.filter((item) => item.severity === "HIGH" || item.normativeBeforeTechnicalNote);
  if (!alerts.length) {
    lines.push("", "Nenhum alerta de alto impacto identificado.");
  } else {
    for (const item of alerts.slice(0, 40)) {
      lines.push(
        "",
        `- ${item.title} - ${item.legalStatus}`,
        `  - Ementa: ${item.ementa || "Sem ementa"}`,
        `  - Documentos: ${item.documents.join(", ")}`,
        `  - Produtos: ${item.products.join(", ") || "Nao classificado"}`,
        `  - Nota Tecnica: ${item.technicalNoteRelated}`,
        `  - Fonte: ${item.officialUrl}`,
      );
    }
  }

  if (report.sourceErrors.length) {
    lines.push("", "## Fontes sem coleta");
    for (const error of report.sourceErrors) {
      lines.push(`- ${error.kind} ${error.year}: ${error.error}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runConfazMonitor() {
  const report = await buildReport();
  await mkdir(outputDir, { recursive: true });
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(reportMarkdownPath, reportToMarkdown(report));
  return { report, reportJsonPath, reportMarkdownPath, snapshotPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runConfazMonitor()
    .then(({ report, reportJsonPath, reportMarkdownPath }) => {
      console.log(`CONFAZ monitor: ${report.totals.publications} publicacoes, ${report.totals.changed} novas/alteradas.`);
      console.log(`JSON: ${reportJsonPath}`);
      console.log(`Markdown: ${reportMarkdownPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
