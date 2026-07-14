import {
  calendarSeed,
  changeSeed,
  frequencyLabels,
  severityLabels,
  sourceSeed,
  statusLabels,
} from "./data.js?v=20260714-title-fix";

const storageKeys = {
  changes: "monitor-fiscal:changes",
  sources: "monitor-fiscal:sources",
  calendar: "monitor-fiscal:calendar",
  supervisorSession: "monitor-fiscal:supervisor-session",
};

const supervisorCredentials = {
  username: "Soften",
  passwordHash: "e85a31bedd35c3a1162bad718909995f1e5befcb0b76251008562c52ef15ff63",
};

const severityOrder = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const today = brazilDateAtNoon(new Date());

const state = {
  view: "dashboard",
  query: "",
  uf: "ALL",
  document: "ALL",
  severity: "ALL",
  status: "ALL",
  selectedChangeId: "chg-nfe-nt-2026",
  detailDialogChangeId: null,
  rulerStartDay: -30,
  calendarMonth: new Date("2026-07-01T00:00:00-03:00"),
  supervisorAuthenticated: sessionStorage.getItem(storageKeys.supervisorSession) === "active",
  supervisorGate: null,
  supervisorError: "",
};

const store = {
  changes: loadSeededCollection(storageKeys.changes, changeSeed),
  sources: loadSeededCollection(storageKeys.sources, sourceSeed),
  calendar: loadSeededCollection(storageKeys.calendar, calendarSeed),
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

function loadSeededCollection(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return structuredClone(fallback);

    const savedItems = JSON.parse(saved);
    if (!Array.isArray(savedItems)) return structuredClone(fallback);
    if (key === storageKeys.calendar) {
      saveCollection(key, structuredClone(fallback));
      return structuredClone(fallback);
    }

    const seedsById = new Map(fallback.map((item) => [item.id, item]));
    const savedWithSeedUpdates = savedItems.map((item) => {
      const seed = seedsById.get(item.id);
      if (!seed) return item;
      if (key === storageKeys.changes) {
        return { ...item, ...structuredClone(seed), status: item.status ?? seed.status };
      }
      return { ...item, ...structuredClone(seed), active: item.active ?? seed.active };
    });

    const savedIds = new Set(savedWithSeedUpdates.map((item) => item.id));
    const newSeedItems = fallback.filter((item) => !savedIds.has(item.id));
    if (!newSeedItems.length) {
      saveCollection(key, savedWithSeedUpdates);
      return savedWithSeedUpdates;
    }

    const merged = [...structuredClone(newSeedItems), ...savedWithSeedUpdates];
    saveCollection(key, merged);
    return merged;
  } catch {
    return structuredClone(fallback);
  }
}

function saveCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

function changeRoute(id) {
  return `#avisos/${encodeURIComponent(id)}`;
}

function readChangeRoute() {
  const match = window.location.hash.match(/^#avisos\/(.+)$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function applyHashRoute() {
  const id = readChangeRoute();
  if (!id || !byId(store.changes, id)) return;

  state.view = "avisos";
  state.selectedChangeId = id;
  state.detailDialogChangeId = id;
}

function updateChangeRoute(id) {
  const hash = changeRoute(id);
  if (window.location.hash === hash) return;
  window.history.replaceState(null, "", hash);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-03:00`));
}

function brazilDateAtNoon(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(value)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});

  return new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00-03:00`);
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00-03:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return today.toISOString().slice(0, 10);
}

function dayDistance(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00-03:00`);
  return Math.round((date - today) / 86400000);
}

const operationalStopPattern =
  /\b(indisponibilidade|indisponivel|parada programada|manuten[cç][aã]o|interrup[cç][aã]o|fora do ar|instabilidade|suspens[aã]o)\b/i;

const monthNumberByName = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  "março": "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function changeText(change) {
  return [
    change.title,
    change.summary,
    change.impact,
    change.action,
    change.changedExcerpt,
    change.theme,
  ]
    .filter(Boolean)
    .join(" ");
}

function isOperationalStop(change) {
  return operationalStopPattern.test(changeText(change));
}

function yearForChange(change) {
  const reference =
    change.effectiveDate || change.productionDate || change.publicationDate || change.detectedAt || "2026";
  return String(reference).slice(0, 4);
}

function normalizeDateParts(year, month, day) {
  const yyyy = String(year).length === 2 ? `20${year}` : String(year);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T12:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? "" : iso;
}

function dateFromOperationalText(change) {
  const text = changeText(change);
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    return normalizeDateParts(numeric[3] || yearForChange(change), numeric[2], numeric[1]);
  }

  const namedMonth = text
    .toLowerCase()
    .match(/\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  if (!namedMonth) return "";

  const monthKey = namedMonth[2].replace("ç", "c");
  return normalizeDateParts(yearForChange(change), monthNumberByName[monthKey], namedMonth[1]);
}

function calendarDateForChange(change) {
  if (change.effectiveDate) return change.effectiveDate;
  if (!isOperationalStop(change)) return "";
  return change.productionDate || dateFromOperationalText(change);
}

function calendarKindLabel(change) {
  return isOperationalStop(change) ? "Indisponibilidade" : "Vigencia";
}

function offsetLabel(value) {
  if (value === 0) return "Hoje";
  return value > 0 ? `+${value}d` : `${value}d`;
}

function hashNumber(value) {
  return Array.from(String(value)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function enrichedChange(change) {
  const baseDate = change.publicationDate ?? change.detectedAt.slice(0, 10);
  const derivedProtocol = `2026/${String(70 + (hashNumber(change.id) % 120)).padStart(4, "0")}`;

  return {
    ...change,
    protocol: change.protocol ?? derivedProtocol,
    publicationDate: baseDate,
    homologationDate: change.homologationDate ?? addDays(baseDate, 20),
    productionDate: change.productionDate ?? (isOperationalStop(change) ? "" : addDays(baseDate, 42)),
    effectiveDate: change.effectiveDate ?? "",
    evidenceUrl: change.evidenceUrl ?? "",
    area:
      change.area ??
      (change.documents.some((doc) =>
        ["NF-e", "NFC-e", "MDF-e", "CT-e", "DF-e", "Distribuicao DF-e"].includes(doc),
      )
        ? "Desenvolvimento"
        : "Fiscal"),
    evidence: change.evidence ?? "",
    changedExcerpt: change.changedExcerpt ?? change.diffAfter ?? change.summary,
  };
}

function deadlineLabel(change) {
  const days = dayDistance(enrichedChange(change).effectiveDate);
  if (days === null) return "Sem obrigatoriedade";
  if (days < 0) return `${Math.abs(days)}d vencido`;
  if (days === 0) return "vence hoje";
  return `vence em ${days}d`;
}

function nextJobLabel() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(next);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactText(value, limit = 150) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trim()}...`;
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function validateSupervisorCredentials(username, password) {
  const cleanUsername = String(username ?? "").trim();
  if (cleanUsername !== supervisorCredentials.username) return false;
  const passwordHash = await sha256Hex(`${cleanUsername}:${password}`);
  return passwordHash === supervisorCredentials.passwordHash;
}

function supervisorActionLabel(gate = state.supervisorGate) {
  if (!gate) return "acessar a fila de revisao";
  if (gate.type === "status" && gate.status === "PUBLISHED") return "publicar este aviso";
  if (gate.type === "status" && gate.status === "IGNORED") return "ignorar este aviso";
  if (gate.type === "calendar-ignore") return "remover este item do calendario";
  return "concluir a revisao";
}

function renderSupervisorLoginCard(mode = "page") {
  return `
    <section class="supervisor-card ${mode === "modal" ? "is-modal" : ""}">
      <div>
        <p class="eyebrow">Acesso de supervisor</p>
        <h2>Login necessario para revisar</h2>
        <p>Informe usuario e senha de supervisor para ${escapeHtml(supervisorActionLabel())}.</p>
      </div>
      <form class="supervisor-form" data-supervisor-form>
        <label>
          <span>Usuario</span>
          <input name="supervisorUser" type="text" autocomplete="username" required />
        </label>
        <label>
          <span>Senha</span>
          <input name="supervisorPassword" type="password" autocomplete="current-password" required />
        </label>
        ${
          state.supervisorError
            ? `<p class="supervisor-error" role="alert">${escapeHtml(state.supervisorError)}</p>`
            : ""
        }
        <div class="button-row">
          <button class="button button-primary" type="submit">Entrar e revisar</button>
          ${
            mode === "modal"
              ? `<button class="button button-muted" type="button" data-action="cancel-supervisor-gate">Cancelar</button>`
              : ""
          }
        </div>
      </form>
    </section>
  `;
}

function renderSupervisorGate() {
  if (!state.supervisorGate) return "";
  return `
    <div class="supervisor-overlay" role="dialog" aria-modal="true" aria-label="Login de supervisor">
      ${renderSupervisorLoginCard("modal")}
    </div>
  `;
}

function severityClass(severity) {
  return `severity severity-${severity.toLowerCase()}`;
}

function renderSeverityHelp(extraClass = "") {
  return `
    <details class="help-popover ${extraClass}">
      <summary aria-label="Ver regra operacional de criticidade" title="Regra operacional de criticidade">?</summary>
      <div class="help-card" role="note">
        <strong>Regra operacional</strong>
        <p><b>Critica:</b> impacto em emissao, autorizacao, homologacao, producao, schema XML, webservice ou prazo obrigatorio proximo.</p>
        <p><b>Alta:</b> NT, schema, regra fiscal, cBenef, Reforma Tributaria, SPED ou documento fiscal relevante para Fiscal, Dev, Suporte e CS.</p>
        <p><b>Media:</b> mudanca importante para acompanhamento, sem impacto operacional imediato.</p>
        <p><b>Baixa:</b> ajuste visual, comunicado informativo ou alteracao sem efeito fiscal pratico.</p>
      </div>
    </details>
  `;
}

function statusClass(status) {
  return `status status-${status.toLowerCase().replace("_", "-")}`;
}

function isDownloadEvidence(value) {
  return /\.(zip|pdf|xlsx?|csv|xml|xsd|json|txt|docx?)$/i.test(String(value).split("?")[0]);
}

function isGenericEvidence(change) {
  const evidence = String(change.evidence ?? "");
  const excerpt = String(change.changedExcerpt ?? "");
  return (
    /captura_automatica|hash normalizado|snapshot automatico/i.test(evidence) ||
    /hash normalizado mudou|conteudo oficial normalizado apresentou alteracao/i.test(excerpt)
  );
}

function fileNameFromUrl(value) {
  try {
    const url = new URL(value);
    const file = url.pathname.split("/").filter(Boolean).at(-1);
    return file ? decodeURIComponent(file) : "";
  } catch {
    return String(value ?? "").split("?")[0].split("/").filter(Boolean).at(-1) ?? "";
  }
}

function evidenceSearchTerms(change, source, directUrl) {
  const rawTerms = [
    change.protocol,
    change.evidence,
    directUrl ? fileNameFromUrl(directUrl) : "",
    change.theme,
    change.documents?.join(" "),
    change.title.replace(/alteracao detectada/gi, ""),
    change.changedExcerpt,
    source.name,
  ];

  const seen = new Set();
  return rawTerms
    .map((term) =>
      String(term ?? "")
        .replace(/\.(pdf|zip|xlsx?|csv|xml|xsd|json|txt|docx?)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((term) => term.length >= 4 && !/captura automatica fonte oficial/i.test(term))
    .map((term) => compactText(term, 64))
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function evidencePrecision(change, directUrl) {
  if (isGenericEvidence(change)) {
    return {
      level: "low",
      label: "Evidencia insuficiente",
      description:
        "A fonte mudou, mas o monitor ainda nao isolou um trecho oficial especifico. Revise manualmente antes de publicar.",
    };
  }

  if (directUrl) {
    return {
      level: "high",
      label: "Evidencia direta",
      description: "Ha link direto para o arquivo ou registro oficial usado na analise.",
    };
  }

  return {
    level: "medium",
    label: "Evidencia por trecho",
    description: "A localizacao depende do trecho detectado e dos termos de busca abaixo.",
  };
}

function renderEvidence(change, source) {
  const genericEvidence = isGenericEvidence(change);
  const evidenceText = genericEvidence
    ? "Alteracao detectada por comparacao automatica, sem arquivo oficial isolado."
    : change.evidence || "Sem arquivo especifico; a evidencia principal esta no trecho oficial monitorado.";
  const directUrl =
    !genericEvidence && (change.evidenceUrl || (/^https?:\/\//i.test(change.evidence) ? change.evidence : ""));
  const shouldDownload = directUrl && isDownloadEvidence(directUrl || change.evidence);
  const evidenceLabel = directUrl ? (shouldDownload ? "Arquivo oficial" : "Registro oficial") : "Tipo de evidencia";
  const precision = evidencePrecision(change, directUrl);
  const searchTerms = evidenceSearchTerms(change, source, directUrl);

  return `
    <details class="evidence-card evidence-${precision.level}">
      <summary>
        <span>
          <strong>Evidencia da mudanca</strong>
          <small>${escapeHtml(precision.label)} - ${escapeHtml(compactText(evidenceText, 96))}</small>
        </span>
        <em>Clique para ver detalhes</em>
      </summary>
      <div class="evidence-body">
        <section class="evidence-precision">
          <strong>${escapeHtml(precision.label)}</strong>
          <p>${escapeHtml(precision.description)}</p>
        </section>
        <section class="evidence-focus">
          <h3>O que mudou</h3>
          <p>${escapeHtml(change.changedExcerpt)}</p>
        </section>
        <section class="evidence-locator">
          <h3>Como localizar na fonte</h3>
          <ol>
            <li>${directUrl ? "Abra a evidencia direta abaixo." : "Abra a fonte oficial abaixo."}</li>
            <li>Use a busca do navegador ou do PDF por um dos termos listados.</li>
            <li>Compare o trecho encontrado com os blocos Antes e Depois.</li>
          </ol>
          <div class="evidence-terms">
            ${
              searchTerms.length
                ? searchTerms.map((term) => `<code>${escapeHtml(term)}</code>`).join("")
                : `<span>Nenhum termo confiavel foi isolado automaticamente.</span>`
            }
          </div>
        </section>
        <div class="evidence-compare">
          <section>
            <h3>Antes</h3>
            <p>${escapeHtml(change.diffBefore)}</p>
          </section>
          <section>
            <h3>Depois</h3>
            <p>${escapeHtml(change.diffAfter)}</p>
          </section>
        </div>
        <dl class="evidence-meta">
          <div>
            <dt>Fonte</dt>
            <dd>${escapeHtml(source.name)}</dd>
          </div>
          <div>
            <dt>${evidenceLabel}</dt>
            <dd>${escapeHtml(evidenceText)}</dd>
          </div>
          <div>
            <dt>Publicacao</dt>
            <dd>${formatDate(change.publicationDate)}</dd>
          </div>
          <div>
            <dt>Obrigatoriedade</dt>
            <dd>${formatDate(change.effectiveDate)}</dd>
          </div>
        </dl>
        <div class="button-row evidence-actions">
          <a class="button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Abrir fonte oficial</a>
          ${
            directUrl
              ? `<a class="button button-muted" href="${escapeHtml(directUrl)}" target="_blank" rel="noreferrer">${
                  shouldDownload ? "Baixar evidencia" : "Abrir evidencia"
                }</a>`
              : ""
          }
        </div>
      </div>
    </details>
  `;
}

function sourceFor(change) {
  return byId(store.sources, change.sourceId) ?? {
    name: "Fonte nao encontrada",
    agency: "-",
    url: "#",
    uf: null,
  };
}

function isGenericChangeTitle(value) {
  return /(^|:\s*)altera[cç][aã]o detectada$/i.test(String(value ?? "").trim());
}

function readableList(values, limit = 3) {
  const items = [...new Set(values.filter(Boolean))].slice(0, limit);
  if (items.length <= 1) return items[0] ?? "documentos fiscais";
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

function titleSubjectForDetectedChange(source, change = {}) {
  const docs = change.documents?.length ? change.documents : source.documents ?? [];
  const text = [source.name, source.category, change.theme, docs.join(" "), change.changedExcerpt, change.summary]
    .filter(Boolean)
    .join(" ");
  const docLabel = readableList(docs);

  if (isOperationalStop(change)) return `acompanhar indisponibilidade de ${docLabel}`;
  if (/esquemas?\s+xml|schema|xsd|xml/i.test(text)) return `revisar schemas ${docLabel}`;
  if (/nota[s ]+t[eé]cnica|(^|\s)nt(\s|$)/i.test(text)) return `revisar nota tecnica ${docLabel}`;
  if (/cbenef/i.test(text)) return "conferir tabela cBenef";
  if (/reforma tributaria|rtc|ibs|cbs|split payment/i.test(text)) return `validar impactos RTC em ${docLabel}`;
  if (/cnpj.*alfanum|alfanum.*cnpj/i.test(text)) return "validar CNPJ alfanumerico";
  if (/not[ií]cia|comunicado|portal|sefaz|receita/i.test(text)) return `revisar comunicado ${docLabel}`;
  if (/sped|efd/i.test(text)) return `revisar obrigacao acessoria ${docLabel}`;

  return `revisar ${docLabel}`;
}

function titleForDetectedChange(source, change = {}) {
  return `${source.name}: ${titleSubjectForDetectedChange(source, change)}`;
}

function displayTitleForChange(change) {
  const source = sourceFor(change);
  return isGenericChangeTitle(change.title) ? titleForDetectedChange(source, change) : change.title;
}

function filteredChanges() {
  const query = state.query.trim().toLowerCase();
  return store.changes
    .filter((change) => {
      const source = sourceFor(change);
      const haystack = [
        displayTitleForChange(change),
        change.title,
        change.summary,
        change.theme,
        source.name,
        source.agency,
        change.documents.join(" "),
        change.uf ?? "NACIONAL",
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesUf =
        state.uf === "ALL" ||
        (state.uf === "NACIONAL" ? !change.uf : change.uf === state.uf);
      const matchesDocument =
        state.document === "ALL" || change.documents.includes(state.document);
      const matchesSeverity = state.severity === "ALL" || change.severity === state.severity;
      const matchesStatus = state.status === "ALL" || change.status === state.status;
      return (
        matchesQuery &&
        matchesUf &&
        matchesDocument &&
        matchesSeverity &&
        matchesStatus
      );
    })
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.detectedAt) - new Date(a.detectedAt);
    });
}

function refreshMetrics() {
  const active = store.sources.filter((source) => source.active).length;
  const open = store.changes.filter((change) =>
    ["DRAFT", "IN_REVIEW"].includes(change.status),
  ).length;
  const critical = store.changes.filter(
    (change) =>
      ["DRAFT", "IN_REVIEW"].includes(change.status) &&
      ["HIGH", "CRITICAL"].includes(change.severity),
  ).length;

  document.querySelector("#metric-active").textContent = active;
  document.querySelector("#metric-open").textContent = open;
  document.querySelector("#metric-critical").textContent = critical;
  document.querySelector("#metric-next-job").textContent = nextJobLabel();
}

function bindShell() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.detailDialogChangeId = null;
      if (window.location.hash.startsWith("#avisos/")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      setActiveTab();
      render();
      app.focus();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.detailDialogChangeId) return;
    state.detailDialogChangeId = null;
    render();
  });

  window.addEventListener("hashchange", () => {
    applyHashRoute();
    setActiveTab();
    render();
    app.focus();
  });
}

function render() {
  refreshMetrics();
  const views = {
    dashboard: renderDashboard,
    avisos: renderAvisos,
    calendario: renderCalendario,
    fontes: renderFontes,
    revisao: renderRevisao,
  };
  app.innerHTML = `${views[state.view]()}${renderChangeDialog()}${renderSupervisorGate()}`;
  bindDynamicActions();
}

function renderDashboard() {
  const enriched = store.changes.map(enrichedChange);
  const openCritical = enriched.filter((change) => ["CRITICAL", "HIGH"].includes(change.severity));
  const analysisList = enriched
    .slice()
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.detectedAt) - new Date(a.detectedAt);
    })
    .slice(0, 6);
  const bySeverity = Object.keys(severityLabels).map((severity) => ({
    severity,
    total: enriched.filter((change) => change.severity === severity).length,
  }));
  const maxSeverity = Math.max(...bySeverity.map((item) => item.total), 1);
  const timelineChanges = enriched
    .filter((change) => change.status !== "IGNORED" && dayDistance(change.effectiveDate) !== null)
    .sort((a, b) => dayDistance(a.effectiveDate) - dayDistance(b.effectiveDate));

  return `
    <section class="view-grid">
      <div class="panel panel-wide ruler-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Timeline fiscal</p>
            <h2>Regua de vigencias oficiais</h2>
          </div>
          <button class="button button-primary" type="button" data-action="simulate-check">
            Executar verificacao
          </button>
        </div>
        ${renderVigenciaRuler(timelineChanges)}
      </div>

      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Fontes oficiais</p>
            <h2>URLs analisadas</h2>
          </div>
        </div>
        ${renderSourceCoverage()}
      </div>

      <div class="panel panel-wide">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Sintese por URL</p>
            <h2>Mudancas fiscais detectadas</h2>
          </div>
        </div>
        <div class="analysis-list">
          ${analysisList.map(renderAnalysisRow).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-heading">
          <div>
            <div class="eyebrow-line">
              <p class="eyebrow">Criticidade</p>
              ${renderSeverityHelp("help-align-right")}
            </div>
            <h2>Impacto fiscal</h2>
          </div>
        </div>
        <div class="bar-chart" aria-label="Mudancas por criticidade">
          ${bySeverity
            .map(
              (item) => `
                <div class="bar-row">
                  <span>${severityLabels[item.severity]}</span>
                  <div class="bar-track">
                    <span class="bar-fill ${item.severity.toLowerCase()}" style="width: ${
                      (item.total / maxSeverity) * 100
                    }%"></span>
                  </div>
                  <strong>${item.total}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderVigenciaRuler(changes) {
  const rangeStart = state.rulerStartDay;
  const rangeEnd = rangeStart + 120;
  const rangeSpan = rangeEnd - rangeStart;
  const ticks = Array.from({ length: 5 }, (_, index) => rangeStart + index * 30);
  const positioned = changes
    .map((change) => ({ ...change, distance: dayDistance(change.effectiveDate) }))
    .filter((change) => change.distance !== null && change.distance >= rangeStart && change.distance <= rangeEnd)
    .map((change, index) => ({ ...change, lane: index % 3 }));
  const beforeWindow = changes.filter((change) => dayDistance(change.effectiveDate) < rangeStart).length;
  const afterWindow = changes.filter((change) => dayDistance(change.effectiveDate) > rangeEnd).length;
  const windowStartDate = formatDate(addDays(todayIso(), rangeStart));
  const windowEndDate = formatDate(addDays(todayIso(), rangeEnd));

  return `
    <div class="vigencia-ruler" aria-label="Regua de vigencia fiscal">
      <div class="ruler-controls">
        <div class="ruler-window-copy">
          <strong>${windowStartDate} a ${windowEndDate}</strong>
          <span>${positioned.length} vigencias oficiais nesta janela</span>
        </div>
        <div class="ruler-nav" aria-label="Navegar na regua de vigencia">
          <button type="button" data-action="ruler-prev" title="Voltar 30 dias" aria-label="Voltar 30 dias">‹</button>
          <button type="button" data-action="ruler-today">Hoje</button>
          <button type="button" data-action="ruler-next" title="Avancar 30 dias" aria-label="Avancar 30 dias">›</button>
        </div>
      </div>
      <div class="ruler-track">
        <span class="ruler-axis"></span>
        ${
          rangeStart <= 0 && rangeEnd >= 0
            ? `<span class="ruler-today" style="left: ${((0 - rangeStart) / rangeSpan) * 100}%"><span>HOJE</span></span>`
            : ""
        }
        ${ticks
          .map(
            (tick) => `
              <span class="ruler-tick" style="left: ${((tick - rangeStart) / rangeSpan) * 100}%">
                ${offsetLabel(tick)}
              </span>
            `,
          )
          .join("")}
        ${positioned
          .map(
            (change) => `
              <button
                class="ruler-marker marker-${change.severity.toLowerCase()}"
                type="button"
                data-action="select-change"
                data-id="${change.id}"
                style="left: ${((change.distance - rangeStart) / rangeSpan) * 100}%; top: ${
                  54 + change.lane * 26
                }px"
                title="${escapeHtml(displayTitleForChange(change))} - ${formatDate(change.effectiveDate)}"
              >
                <span>${escapeHtml(change.protocol)}</span>
              </button>
            `,
          )
          .join("")}
        ${
          positioned.length
            ? ""
            : `<div class="ruler-empty">Sem vigencias oficiais nesta janela.</div>`
        }
      </div>
      <div class="ruler-legend">
        <span>${beforeWindow} anteriores fora da janela</span>
        <strong>Hoje: ${formatDate(todayIso())}</strong>
        <span>${afterWindow} futuras fora da janela</span>
      </div>
      <div class="ruler-window-list" aria-label="Mudancas da janela selecionada">
        ${
          positioned.length
            ? positioned
                .slice()
                .sort((a, b) => a.distance - b.distance)
                .map(
                  (change) => `
                    <button class="ruler-window-item" type="button" data-action="select-change" data-id="${
                      change.id
                    }">
                      <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
                      <strong>${escapeHtml(displayTitleForChange(change))}</strong>
                      <em>${formatDate(change.effectiveDate)}</em>
                    </button>
                  `,
                )
                .join("")
            : `<div class="ruler-window-empty">Use as setas para navegar ate uma janela com vigencias oficiais.</div>`
        }
      </div>
    </div>
  `;
}

function renderAnalysisRow(change) {
  const source = sourceFor(change);
  return `
    <button class="analysis-row" type="button" data-action="select-change" data-id="${change.id}">
      <span class="analysis-source">
        <span>${escapeHtml(source.agency)}</span>
        <small>${escapeHtml(source.url)}</small>
      </span>
      <span class="analysis-copy">
        <strong>${escapeHtml(displayTitleForChange(change))}</strong>
        <small>Trecho: ${escapeHtml(change.changedExcerpt)}</small>
      </span>
      <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
      <em>${deadlineLabel(change)}</em>
    </button>
  `;
}

function renderSourceCoverage() {
  const activeSources = store.sources.filter((source) => source.active);
  const national = activeSources.filter((source) => !source.uf).length;
  const states = new Set(activeSources.map((source) => source.uf).filter(Boolean)).size;
  return `
    <div class="source-coverage">
      <div><strong>${activeSources.length}</strong><span>fontes ativas</span></div>
      <div><strong>${national}</strong><span>nacionais</span></div>
      <div><strong>${states}</strong><span>UFs cobertas</span></div>
    </div>
    <div class="source-samples">
      ${activeSources
        .slice(0, 6)
        .map(
          (source) => `
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(source.name)}</strong>
              <span>${escapeHtml(source.url)}</span>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderAvisos() {
  const changes = filteredChanges();

  return `
    ${renderFilters()}
    <section class="panel alerts-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">${changes.length} registros</p>
          <h2>Avisos fiscais</h2>
        </div>
        <button class="button" type="button" data-action="export-csv">Exportar CSV</button>
      </div>
      <div class="alert-list">
        ${changes.length ? changes.map(renderChangeCard).join("") : renderEmpty("Nenhum aviso encontrado.")}
      </div>
    </section>
  `;
}

function renderChangeDialog() {
  if (state.view !== "avisos" || !state.detailDialogChangeId) return "";
  const change = byId(store.changes, state.detailDialogChangeId);
  if (!change) return "";

  return `
    <div class="change-dialog-overlay">
      <button
        class="change-dialog-backdrop"
        type="button"
        data-action="close-change-dialog"
        aria-label="Fechar detalhes do aviso"
      ></button>
      <section
        class="change-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-dialog-title"
      >
        <div class="change-dialog-bar">
          <div>
            <p class="eyebrow">Detalhe do aviso</p>
            <h2 id="change-dialog-title">${escapeHtml(displayTitleForChange(change))}</h2>
          </div>
          <button class="button icon-button" type="button" data-action="close-change-dialog" aria-label="Fechar detalhes">×</button>
        </div>
        <div class="change-dialog-scroll">
          ${renderChangeDetail(change)}
        </div>
      </section>
    </div>
  `;
}

function renderFilters() {
  const ufs = [
    "NACIONAL",
    ...new Set(
      [
        ...store.sources.map((source) => source.uf),
        ...store.changes.map((change) => change.uf),
      ].filter(Boolean),
    ),
  ];
  const documents = [
    ...new Set([
      ...store.sources.flatMap((source) => source.documents),
      ...store.changes.flatMap((change) => change.documents),
    ]),
  ].sort();
  return `
    <section class="filters" aria-label="Filtros">
      <label>
        <span>Busca</span>
        <input type="search" value="${escapeHtml(state.query)}" data-filter="query" placeholder="NT, cBenef, SPED" />
      </label>
      <label>
        <span>UF</span>
        <select data-filter="uf">
          <option value="ALL">Todas</option>
          ${ufs
            .map(
              (uf) => `<option value="${uf}" ${state.uf === uf ? "selected" : ""}>${uf}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label>
        <span>Documento</span>
        <select data-filter="document">
          <option value="ALL">Todos</option>
          ${documents
            .map(
              (doc) =>
                `<option value="${escapeHtml(doc)}" ${
                  state.document === doc ? "selected" : ""
                }>${escapeHtml(doc)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <div class="filter-field">
        <div class="field-label">
          <span>Criticidade</span>
          ${renderSeverityHelp()}
        </div>
        <select data-filter="severity">
          <option value="ALL">Todas</option>
          ${Object.entries(severityLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${state.severity === value ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </div>
      <label>
        <span>Status</span>
        <select data-filter="status">
          <option value="ALL">Todos</option>
          ${Object.entries(statusLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${state.status === value ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </label>
    </section>
  `;
}

function renderChangeCard(change) {
  const enriched = enrichedChange(change);
  const source = sourceFor(change);
  const selected = change.id === state.selectedChangeId ? " is-selected" : "";
  return `
    <article class="alert-card${selected}" data-change-id="${change.id}">
      <button class="alert-main" type="button" data-action="select-change" data-id="${change.id}">
        <span class="card-kicker">
          <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
          <span class="protocol-stamp">No ${escapeHtml(enriched.protocol)}</span>
        </span>
        <strong>${escapeHtml(displayTitleForChange(enriched))}</strong>
        <span>${escapeHtml(source.name)} - ${deadlineLabel(enriched)}</span>
      </button>
      <span class="${statusClass(change.status)}">${statusLabels[change.status]}</span>
    </article>
  `;
}

function renderChangeDetail(change) {
  const enriched = enrichedChange(change);
  const source = sourceFor(change);
  return `
    <div class="detail-stack">
      <div class="detail-title">
        <div class="detail-badges">
          <span class="${severityClass(enriched.severity)}">${severityLabels[enriched.severity]}</span>
          ${renderSeverityHelp()}
          <span class="protocol-stamp">No ${escapeHtml(enriched.protocol)}</span>
        </div>
        <h2>${escapeHtml(displayTitleForChange(enriched))}</h2>
        <p>${escapeHtml(source.agency)} - ${formatDateTime(enriched.detectedAt)}</p>
      </div>

      <dl class="definition-grid">
        <div><dt>UF</dt><dd>${escapeHtml(enriched.uf ?? "Nacional")}</dd></div>
        <div><dt>Documento</dt><dd>${escapeHtml(enriched.documents.join(", "))}</dd></div>
        <div><dt>Area</dt><dd>${escapeHtml(enriched.area)}</dd></div>
        <div><dt>Confianca</dt><dd>${enriched.confidence}%</dd></div>
      </dl>

      ${renderMilestoneGrid(enriched)}

      <section class="change-excerpt">
        <h3>Trecho da mudanca detectado</h3>
        <p>${escapeHtml(enriched.changedExcerpt)}</p>
        <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
          Abrir URL oficial monitorada
        </a>
      </section>

      ${renderEvidence(enriched, source)}

      <section class="text-block">
        <h3>Resumo IA</h3>
        <p>${escapeHtml(enriched.summary)}</p>
      </section>
      <section class="text-block">
        <h3>Impacto operacional</h3>
        <p>${escapeHtml(enriched.impact)}</p>
      </section>
      <section class="text-block">
        <h3>Acao sugerida</h3>
        <p>${escapeHtml(enriched.action)}</p>
      </section>

      <div class="diff-grid">
        <div>
          <strong>Antes</strong>
          <p>${escapeHtml(enriched.diffBefore)}</p>
        </div>
        <div>
          <strong>Depois</strong>
          <p>${escapeHtml(enriched.diffAfter)}</p>
        </div>
      </div>

      <div class="button-row">
        <a class="button" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Abrir fonte</a>
        ${
          change.status !== "PUBLISHED"
            ? `<button class="button button-primary" type="button" data-action="publish" data-id="${change.id}">Publicar</button>`
            : ""
        }
        ${
          change.status !== "IGNORED"
            ? `<button class="button button-muted" type="button" data-action="ignore" data-id="${change.id}">Ignorar</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderMilestoneGrid(change) {
  const milestones = [
    ["Publicacao", change.publicationDate],
    ["Homologacao", change.homologationDate],
    ["Producao", change.productionDate],
    ["Obrigatoriedade", change.effectiveDate],
  ];
  return `
    <div class="milestone-grid">
      ${milestones
        .map(
          ([label, value]) => `
            <div>
              <span>${label}</span>
              <strong>${formatDate(value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCalendario() {
  const month = state.calendarMonth;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(month);
  const cells = buildCalendarCells(month, enrichedCalendarEvents());

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Calendario fiscal</p>
          <h2>${escapeHtml(monthLabel)}</h2>
        </div>
        <div class="button-row">
          <button class="button icon-button" type="button" data-action="month-prev" aria-label="Mes anterior">‹</button>
          <button class="button icon-button" type="button" data-action="month-next" aria-label="Proximo mes">›</button>
        </div>
      </div>
      <div class="calendar-grid" role="grid">
        ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
          .map((day) => `<strong class="calendar-head">${day}</strong>`)
          .join("")}
        ${cells
          .map(
            (cell) => `
              <div class="calendar-cell ${cell.outside ? "is-outside" : ""}" role="gridcell">
                <span class="calendar-day">${cell.day}</span>
                <div class="calendar-events">
                  ${cell.events
                    .map(
                      (event) => `
                        <div class="calendar-event ${event.severity.toLowerCase()}">
                          <button
                            class="calendar-event-main"
                            type="button"
                            data-action="select-change"
                            data-id="${event.changeId}"
                            aria-label="${escapeHtml(event.ariaLabel)}"
                          >
                            <span class="calendar-event-title">${escapeHtml(event.displayTitle)}</span>
                          </button>
                          <button
                            class="calendar-event-ignore"
                            type="button"
                            data-action="ignore-calendar-event"
                            data-id="${event.changeId}"
                            title="Ignorar e remover do calendario"
                            aria-label="Ignorar e remover ${escapeHtml(event.displayTitle)} do calendario"
                          >
                            Ignorar
                          </button>
                          ${renderCalendarTooltip(event)}
                        </div>
                      `,
                    )
                    .join("")}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function enrichedCalendarEvents() {
  return store.changes
    .map(enrichedChange)
    .map((change) => ({ change, date: calendarDateForChange(change) }))
    .filter(({ change, date }) => change.status !== "IGNORED" && date)
    .map((change) => {
      const date = change.date;
      change = change.change;
      const source = sourceFor(change);
      const displayTitle = calendarEventTitle(change, source);
      const evidence = change.evidence || (change.evidenceUrl ? "Arquivo oficial disponivel" : "Sem evidencia registrada");
      const kindLabel = calendarKindLabel(change);
      return {
        id: `cal-${change.id}`,
        title: displayTitleForChange(change),
        displayTitle,
        date,
        severity: change.severity,
        status: change.status,
        uf: change.uf,
        documents: change.documents,
        sourceId: change.sourceId,
        sourceName: source.name,
        changeId: change.id,
        summary: compactText(change.summary, 170),
        changedExcerpt: compactText(change.changedExcerpt, 170),
        impact: compactText(change.impact, 140),
        evidence: compactText(evidence, 110),
        diffBefore: compactText(change.diffBefore, 110),
        diffAfter: compactText(change.diffAfter, 110),
        effectiveDate: date,
        kindLabel,
        ariaLabel: `${displayTitle}. ${change.summary}. Trecho: ${change.changedExcerpt}. Evidencia: ${evidence}. ${kindLabel}: ${formatDate(date)}.`,
      };
    });
}

function calendarEventTitle(change, source) {
  return isGenericChangeTitle(change.title) ? titleForDetectedChange(source, change) : displayTitleForChange(change);
}

function renderCalendarTooltip(event) {
  return `
    <span class="calendar-tooltip" role="tooltip">
      <strong>${escapeHtml(event.title)}</strong>
      <span><b>Fonte:</b> ${escapeHtml(event.sourceName)}</span>
      <span><b>Documento:</b> ${escapeHtml(event.documents.join(", "))}</span>
      <span><b>${escapeHtml(event.kindLabel)}:</b> ${formatDate(event.effectiveDate)}</span>
      <span><b>Resumo:</b> ${escapeHtml(event.summary)}</span>
      <span><b>Trecho:</b> ${escapeHtml(event.changedExcerpt)}</span>
      <span><b>Antes:</b> ${escapeHtml(event.diffBefore)}</span>
      <span><b>Depois:</b> ${escapeHtml(event.diffAfter)}</span>
      <span><b>Evidencia:</b> ${escapeHtml(event.evidence)}</span>
      <em>Clique no titulo para abrir. Use Ignorar para remover do calendario.</em>
    </span>
  `;
}

function buildCalendarCells(month, events) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
      events: events.filter((event) => event.date === iso),
    };
  });
}

function renderFontes() {
  const sources = store.sources
    .filter((source) => {
      const query = state.query.trim().toLowerCase();
      const haystack = [source.name, source.agency, source.uf, source.documents.join(" ")]
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.name.localeCompare(b.name);
    });

  return `
    <section class="filters compact-filter" aria-label="Filtro de fontes">
      <label>
        <span>Busca</span>
        <input type="search" value="${escapeHtml(state.query)}" data-filter="query" placeholder="SEFAZ, NF-e, SP" />
      </label>
      <button class="button" type="button" data-action="reset-demo">Restaurar seed</button>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">${sources.length} fontes</p>
          <h2>Fontes monitoradas</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>UF</th>
              <th>Docs</th>
              <th>Freq.</th>
              <th>Crit.</th>
              <th>Ultima checagem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sources.map(renderSourceRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSourceRow(source) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${escapeHtml(source.agency)}</span>
      </td>
      <td>${escapeHtml(source.uf ?? "Nacional")}</td>
      <td>${escapeHtml(source.documents.join(", "))}</td>
      <td>${frequencyLabels[source.frequency]}</td>
      <td><span class="${severityClass(source.severity)}">${severityLabels[source.severity]}</span></td>
      <td>${formatDateTime(source.lastCheckedAt)}</td>
      <td>
        <button class="button table-button" type="button" data-action="check-source" data-id="${source.id}">
          Verificar
        </button>
      </td>
    </tr>
  `;
}

function renderRevisao() {
  if (!state.supervisorAuthenticated) {
    return `
      <section class="supervisor-shell">
        ${renderSupervisorLoginCard()}
      </section>
    `;
  }

  const pending = store.changes
    .filter((change) => ["DRAFT", "IN_REVIEW"].includes(change.status))
    .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  return `
    <section class="split-layout review-layout">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">${pending.length} pendentes</p>
            <h2>Fila de revisao</h2>
          </div>
          <button class="button button-muted" type="button" data-action="supervisor-logout">Sair do supervisor</button>
        </div>
        <div class="review-list">
          ${
            pending.length
              ? pending.map(renderReviewItem).join("")
              : renderEmpty("Nao ha mudancas aguardando revisao.")
          }
        </div>
      </div>
      <aside class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Regra operacional</p>
            <h2>Publicacao segura</h2>
          </div>
        </div>
        <div class="rule-list">
          <p><strong>Critica</strong> exige validacao humana e notificacao imediata.</p>
          <p><strong>Alta</strong> entra em revisao para Fiscal, Dev, Suporte e CS.</p>
          <p><strong>Media</strong> fica em acompanhamento com historico auditavel.</p>
          <p><strong>Baixa</strong> pode ser ignorada sem apagar snapshots.</p>
        </div>
      </aside>
    </section>
  `;
}

function renderReviewItem(change) {
  const source = sourceFor(change);
  return `
    <article class="review-item">
      <div>
        <span class="${severityClass(change.severity)}">${severityLabels[change.severity]}</span>
        <h3>${escapeHtml(displayTitleForChange(change))}</h3>
        <p>${escapeHtml(source.name)} - ${escapeHtml(change.summary)}</p>
      </div>
      <div class="button-row">
        <button class="button button-primary" type="button" data-action="publish" data-id="${change.id}">Publicar</button>
        <button class="button button-muted" type="button" data-action="ignore" data-id="${change.id}">Ignorar</button>
      </div>
    </article>
  `;
}

function renderEmpty(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function bindDynamicActions() {
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.filter] = input.value;
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action, element.dataset.id));
  });

  document.querySelectorAll("[data-supervisor-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSupervisorLogin(form);
    });
  });
}

function handleAction(action, id) {
  const handlers = {
    "select-change": () => {
      state.selectedChangeId = id;
      state.view = "avisos";
      state.detailDialogChangeId = id;
      updateChangeRoute(id);
      setActiveTab();
      render();
    },
    "close-change-dialog": () => {
      state.detailDialogChangeId = null;
      render();
    },
    publish: () => requestSupervisorAction({ type: "status", id, status: "PUBLISHED" }),
    ignore: () => requestSupervisorAction({ type: "status", id, status: "IGNORED" }),
    "ignore-calendar-event": () => requestSupervisorAction({ type: "calendar-ignore", id }),
    "export-csv": exportCsv,
    "simulate-check": () => simulateCheck(),
    "check-source": () => simulateCheck(id),
    "ruler-prev": () => {
      state.rulerStartDay -= 30;
      render();
    },
    "ruler-next": () => {
      state.rulerStartDay += 30;
      render();
    },
    "ruler-today": () => {
      state.rulerStartDay = -30;
      render();
    },
    "open-source": () => {
      const source = byId(store.sources, id);
      if (source) window.open(source.url, "_blank", "noopener");
    },
    "month-prev": () => {
      state.calendarMonth.setMonth(state.calendarMonth.getMonth() - 1);
      render();
    },
    "month-next": () => {
      state.calendarMonth.setMonth(state.calendarMonth.getMonth() + 1);
      render();
    },
    "cancel-supervisor-gate": () => {
      state.supervisorGate = null;
      state.supervisorError = "";
      render();
    },
    "supervisor-logout": () => {
      sessionStorage.removeItem(storageKeys.supervisorSession);
      state.supervisorAuthenticated = false;
      state.supervisorGate = null;
      showToast("Sessao de supervisor encerrada.");
      render();
    },
    "reset-demo": resetDemo,
  };
  handlers[action]?.();
}

async function handleSupervisorLogin(form) {
  const data = new FormData(form);
  const username = data.get("supervisorUser");
  const password = data.get("supervisorPassword");
  try {
    const isValid = await validateSupervisorCredentials(username, password);
    if (!isValid) {
      state.supervisorError = "Usuario ou senha de supervisor invalidos.";
      render();
      return;
    }

    state.supervisorAuthenticated = true;
    sessionStorage.setItem(storageKeys.supervisorSession, "active");
    state.supervisorError = "";
    const pendingAction = state.supervisorGate;
    state.supervisorGate = null;
    showToast("Supervisor autenticado.");

    if (pendingAction) {
      performSupervisorAction(pendingAction);
      return;
    }

    render();
  } catch {
    state.supervisorError = "Nao foi possivel validar o login neste navegador.";
    render();
  }
}

function requestSupervisorAction(action) {
  if (state.supervisorAuthenticated) {
    performSupervisorAction(action);
    return;
  }

  state.supervisorGate = action;
  state.supervisorError = "";
  render();
}

function performSupervisorAction(action) {
  if (action.type === "status") {
    updateChangeStatus(action.id, action.status);
    return;
  }

  if (action.type === "calendar-ignore") {
    ignoreCalendarEvent(action.id);
  }
}

function setActiveTab() {
  document
    .querySelectorAll("[data-view]")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
}

function updateChangeStatus(id, status) {
  const change = byId(store.changes, id);
  if (!change) return;
  change.status = status;
  saveCollection(storageKeys.changes, store.changes);
  showToast(status === "PUBLISHED" ? "Aviso publicado." : "Mudanca ignorada com historico.");
  render();
}

function ignoreCalendarEvent(id) {
  const change = byId(store.changes, id);
  if (!change) return;
  change.status = "IGNORED";
  saveCollection(storageKeys.changes, store.changes);
  showToast("Aviso ignorado e removido do calendario.");
  render();
}

function simulateCheck(sourceId) {
  const source =
    byId(store.sources, sourceId) ??
    store.sources.find((item) => item.severity === "CRITICAL") ??
    store.sources[0];
  const now = new Date();
  const suffix = String(now.getTime()).slice(-5);
  const change = {
    id: `chg-sim-${suffix}`,
    sourceId: source.id,
    title: titleForDetectedChange(source),
    protocol: `2026/${String(200 + Number(suffix.slice(-3))).padStart(4, "0")}`,
    detectedAt: now.toISOString(),
    publicationDate: now.toISOString().slice(0, 10),
    homologationDate: addDays(now.toISOString().slice(0, 10), 20),
    productionDate: addDays(now.toISOString().slice(0, 10), 42),
    effectiveDate: addDays(now.toISOString().slice(0, 10), source.severity === "CRITICAL" ? 30 : 60),
    area: ["CRITICAL", "HIGH"].includes(source.severity) ? "Desenvolvimento" : "Fiscal",
    evidence: "snapshot automatico da fonte oficial",
    severity: source.severity,
    status: ["CRITICAL", "HIGH"].includes(source.severity) ? "IN_REVIEW" : "DRAFT",
    theme: source.documents.includes("NF-e") ? "Validacao fiscal" : "Outro",
    uf: source.uf,
    documents: source.documents,
    confidence: source.severity === "CRITICAL" ? 91 : 82,
    summary:
      "O hash normalizado mudou apos remocao de menus, rodapes, banners e datas dinamicas.",
    impact:
      "A mudanca precisa ser comparada com a fonte oficial antes de comunicacao externa.",
    action: "Abrir a fonte, validar o diff e decidir entre publicar, editar ou ignorar.",
    diffBefore: `Hash anterior ${source.lastHash ?? "sem snapshot"}.`,
    diffAfter: `Novo hash normalizado ${Math.random().toString(16).slice(2, 8)}.`,
    changedExcerpt:
      "Conteudo oficial normalizado apresentou alteracao em trecho tecnico ligado a documento fiscal, prazo ou regra de validacao.",
  };
  source.lastCheckedAt = now.toISOString();
  source.lastHash = Math.random().toString(16).slice(2, 8);
  store.changes.unshift(change);
  saveCollection(storageKeys.sources, store.sources);
  saveCollection(storageKeys.changes, store.changes);
  state.selectedChangeId = change.id;
  state.view = "avisos";
  setActiveTab();
  showToast("Verificacao manual registrada.");
  render();
}

function exportCsv() {
  const rows = [
    [
      "protocolo",
      "titulo",
      "fonte",
      "uf",
      "documentos",
      "criticidade",
      "status",
      "obrigatoriedade",
      "detectado_em",
    ],
    ...filteredChanges().map((change) => {
      const enriched = enrichedChange(change);
      const source = sourceFor(change);
      return [
        enriched.protocol,
        displayTitleForChange(enriched),
        source.name,
        enriched.uf ?? "Nacional",
        enriched.documents.join(", "),
        severityLabels[enriched.severity],
        statusLabels[enriched.status],
        enriched.effectiveDate,
        enriched.detectedAt,
      ];
    }),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "avisos-fiscais.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV gerado.");
}

function resetDemo() {
  store.changes = structuredClone(changeSeed);
  store.sources = structuredClone(sourceSeed);
  store.calendar = structuredClone(calendarSeed);
  saveCollection(storageKeys.changes, store.changes);
  saveCollection(storageKeys.sources, store.sources);
  saveCollection(storageKeys.calendar, store.calendar);
  state.selectedChangeId = "chg-nfe-nt-2026";
  showToast("Seed inicial restaurado.");
  render();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

bindShell();
applyHashRoute();
setActiveTab();
render();
