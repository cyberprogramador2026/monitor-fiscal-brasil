import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { changeSeed, sourceSeed } from "../data.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workRoot = resolve(
  process.env.PDF_ANALYZER_WORK_DIR ?? join(tmpdir(), "monitor-fiscal-brasil-pdf-analysis"),
);
const pdfDir = join(workRoot, "tmp", "pdfs");
const outputDir = resolve(process.env.PDF_ANALYZER_OUTPUT_DIR ?? join(workRoot, "output"));
const maxPdfs = Number(process.env.PDF_ANALYZER_MAX_PDFS ?? 25);
const maxPages = Number(process.env.PDF_ANALYZER_MAX_PAGES ?? 60);
const maxBytes = Number(process.env.PDF_ANALYZER_MAX_BYTES ?? 35 * 1024 * 1024);
const extractorPath = join(root, "scripts", "pdf_text_extract.py");
const reportJsonPath = join(outputDir, "technical-notes-analysis.json");
const reportMarkdownPath = join(outputDir, "technical-notes-analysis.md");

const technicalSourcePattern =
  /\b(nota[s ]+tecnica[s]?|nt\b|documenta[cç][aã]o|documentos|esquemas|prazos sefaz|rtc|dfe|df-e|nf-e|nfc-e|ct-e|mdf-e|nfcom|nf3e|bp-e|nfs-e)\b/i;
const pdfUrlPattern = /\.pdf(?:[?#].*)?$/i;
const technicalLinkPattern =
  /\b(pdf|nota[s ]+t[eé]cnica[s]?|nt\b|informe t[eé]cnico|manual|leiaute|schema|esquema|rtc|prazos?|homologa[cç][aã]o|produ[cç][aã]o)\b/i;
const datePattern =
  /\b(?:[0-3]?\d[/-][01]?\d[/-](?:20)?\d{2}|[0-3]?\d\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de)?\s+20\d{2})\b/gi;
const deadlineKeywordPattern =
  /\b(homologa[cç][aã]o|produ[cç][aã]o|vig[eê]ncia|obrigatoriedade|obrigat[oó]rio|implanta[cç][aã]o|prazo|suspens[aã]o|desativa[cç][aã]o|descontinua[cç][aã]o|indisponibilidade|manuten[cç][aã]o|parada programada|ambiente de produ[cç][aã]o|ambiente de homologa[cç][aã]o)\b/gi;
const changeKeywordPattern =
  /\b(altera[cç][aã]o|alterad[ao]s?|inclu(?:s[aã]o|[ií]d[ao]s?|ir|i)|exclu(?:s[aã]o|[ií]d[ao]s?|ir|i)|nov[ao]s?\s+campos?|regra[s]?\s+de\s+valida[cç][aã]o|schema|schemas|leiaute|layout|rejei[cç][aã]o|c[oó]digo|grupo|tag|xml|obrigat[oó]rio|facultativo|descontinu[aã]d[ao]s?)\b/gi;
const noteIdentityPattern =
  /\b(?:nota\s+t[eé]cnica|nt|informe\s+t[eé]cnico|it)\s*(?:n[ºo.]*)?\s*\d{4}[./]\d{3}(?:\s*v(?:ers[aã]o)?\.?\s*\d+(?:\.\d+)*)?/gi;
const versionPattern = /\bv(?:ers[aã]o)?\.?\s*\d+(?:\.\d+)*/gi;

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanSnippet(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function sourceLooksTechnical(source) {
  const haystack = [
    source.id,
    source.name,
    source.agency,
    source.category,
    source.url,
    ...(source.documents ?? []),
  ].join(" ");
  return technicalSourcePattern.test(haystack);
}

function linkLooksTechnical(url, label = "") {
  const haystack = `${decodeURIComponent(url)} ${label}`;
  return pdfUrlPattern.test(url) || technicalLinkPattern.test(haystack);
}

function safeFilename(url, fallback) {
  let name = fallback;
  try {
    name = basename(new URL(url).pathname) || fallback;
  } catch {
    name = fallback;
  }

  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  const cleaned = decodeURIComponent(name)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${cleaned || "nota-tecnica"}-${hash}.pdf`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "MonitorFiscalBrasil/0.1 PDF analyzer",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractLinksFromHtml(html, baseUrl, source) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtml(match[1]);
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:")) continue;

    let url;
    try {
      url = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }

    const label = stripTags(match[2]);
    if (!linkLooksTechnical(url, label)) continue;

    links.push({
      url,
      title: label || source.name,
      sourceId: source.id,
      sourceName: source.name,
      origin: "source-page",
    });
  }
  return links;
}

function seededEvidenceCandidates() {
  return changeSeed
    .filter((change) => change.evidenceUrl && linkLooksTechnical(change.evidenceUrl, change.title))
    .map((change) => ({
      url: change.evidenceUrl,
      title: change.title,
      sourceId: change.sourceId,
      sourceName: sourceSeed.find((source) => source.id === change.sourceId)?.name ?? change.sourceId,
      origin: "change-seed",
      changeId: change.id,
    }));
}

async function discoverCandidates() {
  const candidates = [...seededEvidenceCandidates()];
  const technicalSources = sourceSeed.filter(sourceLooksTechnical);

  for (const source of technicalSources) {
    if (linkLooksTechnical(source.url, source.name)) {
      candidates.push({
        url: source.url,
        title: source.name,
        sourceId: source.id,
        sourceName: source.name,
        origin: "source-url",
      });
    }

    try {
      const html = await fetchText(source.url);
      candidates.push(...extractLinksFromHtml(html, source.url, source));
    } catch (error) {
      candidates.push({
        url: source.url,
        title: source.name,
        sourceId: source.id,
        sourceName: source.name,
        origin: "source-error",
        error: error.message,
      });
    }
  }

  return uniqueBy(
    candidates.filter((candidate) => !candidate.error),
    (candidate) => candidate.url,
  ).slice(0, maxPdfs);
}

async function downloadPdf(candidate) {
  const response = await fetch(candidate.url, {
    headers: {
      "user-agent": "MonitorFiscalBrasil/0.1 PDF analyzer",
      accept: "application/pdf,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`arquivo acima do limite (${contentLength} bytes)`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error(`arquivo acima do limite (${buffer.length} bytes)`);
  if (!contentType.includes("pdf") && buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error(`link nao retornou PDF (${contentType || "sem content-type"})`);
  }

  await mkdir(pdfDir, { recursive: true });
  const pdfPath = join(pdfDir, safeFilename(candidate.url, candidate.title));
  await writeFile(pdfPath, buffer);
  return pdfPath;
}

function candidatePythonExecutables() {
  const fromEnv = process.env.PDF_ANALYZER_PYTHON ? [process.env.PDF_ANALYZER_PYTHON] : [];
  const userProfile = process.env.USERPROFILE;
  const bundled = userProfile
    ? [
        join(
          userProfile,
          ".cache",
          "codex-runtimes",
          "codex-primary-runtime",
          "dependencies",
          "python",
          "python.exe",
        ),
      ]
    : [];
  return [...fromEnv, ...bundled, "python", "python3"];
}

function findPython() {
  for (const candidate of candidatePythonExecutables()) {
    if (candidate.includes("\\") && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-c", "import pdfplumber, json; print(json.dumps(True))"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }

  throw new Error(
    "Nao encontrei Python com pdfplumber. Defina PDF_ANALYZER_PYTHON apontando para o Python do runtime.",
  );
}

function extractPdfText(pdfPath, python) {
  const result = spawnSync(python, [extractorPath, pdfPath, String(maxPages)], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 80 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `extrator retornou ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function normalizeDate(rawDate) {
  const raw = rawDate.trim();
  const numeric = raw.match(/^([0-3]?\d)[/-]([01]?\d)[/-]((?:20)?\d{2})$/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    const month = numeric[2].padStart(2, "0");
    const day = numeric[1].padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    const date = new Date(`${iso}T12:00:00-03:00`);
    return Number.isNaN(date.getTime()) ? "" : iso;
  }

  const named = normalizeText(raw).match(
    /^([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de)?\s+(20\d{2})$/,
  );
  if (!named) return "";

  const iso = `${named[3]}-${monthNumbers.get(named[2])}-${named[1].padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? "" : iso;
}

function datesIn(value) {
  return uniqueBy(
    [...String(value ?? "").matchAll(datePattern)]
      .map((match) => ({
        raw: match[0],
        iso: normalizeDate(match[0]),
      }))
      .filter((date) => date.iso),
    (date) => date.iso,
  );
}

function snippetAround(text, index, radius = 220) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return cleanSnippet(text.slice(start, end));
}

function deadlineKind(snippet) {
  const normalized = normalizeText(snippet);
  if (normalized.includes("indisponibilidade") || normalized.includes("manutencao")) {
    return "Indisponibilidade";
  }
  if (normalized.includes("homologacao")) return "Homologacao";
  if (normalized.includes("producao")) return "Producao";
  if (normalized.includes("obrigator")) return "Obrigatoriedade";
  if (normalized.includes("vigencia")) return "Vigencia";
  if (normalized.includes("suspensao")) return "Suspensao";
  if (normalized.includes("descontinu") || normalized.includes("desativa")) return "Descontinuacao";
  if (normalized.includes("implantacao")) return "Implantacao";
  return "Prazo";
}

function looksLikeVersionHistoryDate(snippet) {
  const normalized = normalizeText(snippet);
  return normalized.includes("historico de versoes") && normalized.includes("alteracoes de versao");
}

function extractDeadlineCandidates(text) {
  const candidates = [];
  for (const match of text.matchAll(deadlineKeywordPattern)) {
    const snippet = snippetAround(text, match.index);
    if (looksLikeVersionHistoryDate(snippet)) continue;
    const dates = datesIn(snippet);
    if (!dates.length) continue;
    candidates.push({
      kind: deadlineKind(snippet),
      dates,
      snippet,
    });
  }

  for (const match of text.matchAll(datePattern)) {
    const snippet = snippetAround(text, match.index);
    if (looksLikeVersionHistoryDate(snippet)) continue;
    deadlineKeywordPattern.lastIndex = 0;
    if (!deadlineKeywordPattern.test(snippet)) continue;
    deadlineKeywordPattern.lastIndex = 0;
    candidates.push({
      kind: deadlineKind(snippet),
      dates: datesIn(snippet),
      snippet,
    });
  }

  deadlineKeywordPattern.lastIndex = 0;
  return uniqueBy(candidates, (item) => `${item.kind}:${item.dates.map((date) => date.iso).join(",")}:${item.snippet}`)
    .slice(0, 20);
}

function extractChangeCandidates(text) {
  const candidates = [];
  for (const match of text.matchAll(changeKeywordPattern)) {
    const snippet = snippetAround(text, match.index);
    candidates.push({
      keyword: match[0],
      dates: datesIn(snippet),
      snippet,
    });
  }
  return uniqueBy(candidates, (item) => item.snippet).slice(0, 20);
}

function extractIdentity(text, fallbackTitle) {
  const firstLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  const identity =
    firstLines.find((line) => {
      noteIdentityPattern.lastIndex = 0;
      return noteIdentityPattern.test(line);
    }) ??
    firstLines[0] ??
    fallbackTitle;
  noteIdentityPattern.lastIndex = 0;
  return cleanSnippet(identity);
}

function extractVersions(text) {
  const identities = [...text.matchAll(noteIdentityPattern)].map((match) => cleanSnippet(match[0]));
  noteIdentityPattern.lastIndex = 0;
  const versions = [...text.matchAll(versionPattern)].map((match) => cleanSnippet(match[0]));
  versionPattern.lastIndex = 0;
  return uniqueBy([...identities, ...versions], (value) => normalizeText(value)).slice(0, 12);
}

function analyzeText(candidate, extracted) {
  const text = extracted.text ?? "";
  return {
    ...candidate,
    pdfPath: extracted.path,
    pageCount: extracted.pageCount,
    pagesRead: extracted.pagesRead,
    identity: extractIdentity(text, candidate.title),
    versions: extractVersions(text),
    deadlines: extractDeadlineCandidates(text),
    changes: extractChangeCandidates(text),
  };
}

function markdownForReport(report) {
  const lines = [
    "# Analise de notas tecnicas em PDF",
    "",
    `Gerado em: ${report.generatedAt}`,
    `PDFs analisados: ${report.items.length}`,
    `Limite de paginas por PDF: ${maxPages}`,
    "",
  ];

  if (report.errors.length) {
    lines.push("## Erros de coleta", "");
    for (const error of report.errors) {
      lines.push(`- ${error.sourceName ?? error.url}: ${error.error}`);
    }
    lines.push("");
  }

  for (const item of report.items) {
    lines.push(`## ${item.identity || item.title}`, "");
    lines.push(`Fonte: ${item.sourceName}`);
    lines.push(`URL: ${item.url}`);
    lines.push(`Paginas lidas: ${item.pagesRead}/${item.pageCount}`);
    if (item.versions.length) lines.push(`Versoes/identificadores: ${item.versions.join("; ")}`);
    lines.push("");
    lines.push("### Prazos candidatos");
    if (!item.deadlines.length) {
      lines.push("- Nenhum prazo com data foi encontrado automaticamente.");
    } else {
      for (const deadline of item.deadlines) {
        const dates = deadline.dates.map((date) => date.iso).join(", ");
        lines.push(`- ${dates} | ${deadline.kind} | ${deadline.snippet}`);
      }
    }
    lines.push("");
    lines.push("### Mudancas candidatas");
    if (!item.changes.length) {
      lines.push("- Nenhuma mudanca textual relevante foi encontrada automaticamente.");
    } else {
      for (const change of item.changes) {
        const dates = change.dates.length ? ` (${change.dates.map((date) => date.iso).join(", ")})` : "";
        lines.push(`- ${change.snippet}${dates}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const python = findPython();
  const candidates = await discoverCandidates();
  const report = {
    generatedAt: new Date().toISOString(),
    workRoot,
    maxPdfs,
    maxPages,
    candidates: candidates.length,
    items: [],
    errors: [],
  };

  for (const candidate of candidates) {
    try {
      const pdfPath = await downloadPdf(candidate);
      const extracted = extractPdfText(pdfPath, python);
      report.items.push(analyzeText(candidate, extracted));
      console.log(`OK ${report.items.length}/${Math.min(candidates.length, maxPdfs)} ${candidate.title}`);
    } catch (error) {
      report.errors.push({ ...candidate, error: error.message });
      console.warn(`ERRO ${candidate.title}: ${error.message}`);
    }
  }

  await writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await writeFile(reportMarkdownPath, markdownForReport(report));
  console.log(`Relatorio JSON: ${reportJsonPath}`);
  console.log(`Relatorio Markdown: ${reportMarkdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
