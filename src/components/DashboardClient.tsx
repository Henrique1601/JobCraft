"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  aggregateEvents,
  BLOCKED_STATUS_RE,
  DISCARDED_STATUS_RE,
  parseJsonl,
  SENT_STATUS_RE,
  type DashboardData,
  type JobRecord,
  type RunEvent,
} from "@/lib/runs-shared";

const NOTION_PIPELINE_URL =
  "https://app.notion.com/p/Candidaturas-Pipeline-de-Vagas-41d37ba8664981349f8cef6ba427c3ee";
const IMPORT_STORAGE_KEY = "jobcraft_imported_events_v1";
const IMPORT_EVENT_NAME = "jobcraft:imported";
const EMPTY_EVENTS: RunEvent[] = [];

let cachedStorageRaw: string | null = null;
let cachedStorageEvents: RunEvent[] = EMPTY_EVENTS;

function getImportedSnapshot(): RunEvent[] {
  try {
    const raw = localStorage.getItem(IMPORT_STORAGE_KEY);
    if (raw === cachedStorageRaw) return cachedStorageEvents;
    cachedStorageRaw = raw;
    if (!raw) {
      cachedStorageEvents = EMPTY_EVENTS;
      return cachedStorageEvents;
    }
    const parsed = JSON.parse(raw);
    cachedStorageEvents = Array.isArray(parsed) ? (parsed as RunEvent[]) : EMPTY_EVENTS;
    return cachedStorageEvents;
  } catch {
    return EMPTY_EVENTS;
  }
}

function getImportedServerSnapshot(): RunEvent[] {
  return EMPTY_EVENTS;
}

function subscribeImported(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(IMPORT_EVENT_NAME, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(IMPORT_EVENT_NAME, callback);
  };
}

type SortMode = "recent" | "score_desc" | "company_asc";

function statusTone(status: string): string {
  if (SENT_STATUS_RE.test(status)) {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  if (BLOCKED_STATUS_RE.test(status)) {
    return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
  if (DISCARDED_STATUS_RE.test(status)) {
    return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
}

function scoreTone(score: number, minScore: number): string {
  if (score >= minScore) {
    return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  }
  if (score >= 60) {
    return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  }
  return "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function csvEscape(value: string | number): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function DashboardClient({ initial }: { initial: DashboardData }) {
  const [serverData, setServerData] = useState<DashboardData>(initial);
  const importedEvents = useSyncExternalStore(
    subscribeImported,
    getImportedSnapshot,
    getImportedServerSnapshot
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortMode>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(initial.jobs[0]?.id ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const data: DashboardData = useMemo(() => {
    if (importedEvents.length === 0) return serverData;
    const serverEvents: RunEvent[] = serverData.jobs.flatMap((job) =>
      job.timeline.map((step) => ({
        timestamp: step.timestamp,
        job_title: job.job_title,
        company: job.company,
        platform: job.platform,
        track: job.track,
        language: job.language,
        work_model: job.work_model,
        match_score: job.match_score,
        step: step.step,
        status: step.status,
        job_url: job.job_url,
        screenshot_path: step.screenshot_path,
        error_reason: step.error_reason,
      }))
    );
    return aggregateEvents([...serverEvents, ...importedEvents], serverData.profile);
  }, [serverData, importedEvents]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/runs", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }
      const next: DashboardData = await res.json();
      setServerData(next);
    } catch {
      setErrorMsg("Não foi possível atualizar os dados agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  async function handleImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    const parsedAll: RunEvent[] = [];

    for (const file of Array.from(files)) {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const json = JSON.parse(text);
          const list = Array.isArray(json) ? json : [json];
          parsedAll.push(...parseJsonl(list.map((item) => JSON.stringify(item)).join("\n")));
        } catch {
          // Ignore malformed JSON file
        }
      } else {
        parsedAll.push(...parseJsonl(text));
      }
    }

    if (parsedAll.length === 0) {
      setErrorMsg("Nenhum evento válido encontrado nos arquivos selecionados.");
      return;
    }

    const merged = [...importedEvents, ...parsedAll];
    try {
      localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new Event(IMPORT_EVENT_NAME));
    } catch {
      setErrorMsg("Não foi possível salvar os eventos importados no navegador.");
    }
  }

  function clearImported() {
    try {
      localStorage.removeItem(IMPORT_STORAGE_KEY);
      window.dispatchEvent(new Event(IMPORT_EVENT_NAME));
    } catch {
      // Ignore
    }
  }

  const platformOptions = useMemo(() => {
    return Array.from(new Set(data.jobs.map((j) => j.platform).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [data.jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.jobs.filter((j) => {
      if (trackFilter !== "ALL" && j.track !== trackFilter) return false;
      if (platformFilter !== "ALL" && j.platform !== platformFilter) return false;
      if (statusFilter !== "ALL") {
        if (statusFilter === "SENT" && !SENT_STATUS_RE.test(j.latest_status)) return false;
        if (statusFilter === "BLOCKED" && !BLOCKED_STATUS_RE.test(j.latest_status)) return false;
        if (statusFilter === "DISCARDED" && !DISCARDED_STATUS_RE.test(j.latest_status)) return false;
        if (
          statusFilter === "REVIEW" &&
          (SENT_STATUS_RE.test(j.latest_status) ||
            BLOCKED_STATUS_RE.test(j.latest_status) ||
            DISCARDED_STATUS_RE.test(j.latest_status))
        )
          return false;
      }
      if (!q) return true;
      return (
        j.job_title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.platform.toLowerCase().includes(q) ||
        j.work_model.toLowerCase().includes(q)
      );
    });

    if (sortBy === "score_desc") {
      return [...list].sort((a, b) => b.match_score - a.match_score);
    }
    if (sortBy === "company_asc") {
      return [...list].sort((a, b) => a.company.localeCompare(b.company));
    }
    return list;
  }, [data.jobs, query, trackFilter, platformFilter, statusFilter, sortBy]);

  const activeSelected: JobRecord | null = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((j) => j.id === selectedId) ?? filtered[0];
  }, [filtered, selectedId]);

  const hasActiveFilters =
    query.trim() !== "" ||
    trackFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    platformFilter !== "ALL";

  function clearFilters() {
    setQuery("");
    setTrackFilter("ALL");
    setStatusFilter("ALL");
    setPlatformFilter("ALL");
  }

  function exportCsv() {
    if (filtered.length === 0) return;
    const headers = [
      "job_title",
      "company",
      "platform",
      "track",
      "work_model",
      "language",
      "match_score",
      "latest_status",
      "updated_at",
      "job_url",
    ];
    const rows = filtered.map((j) =>
      [
        j.job_title,
        j.company,
        j.platform,
        j.track,
        j.work_model,
        j.language,
        j.match_score,
        j.latest_status,
        j.updated_at,
        j.job_url,
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobcraft-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
                JC
              </span>
              <h1 className="text-lg font-semibold tracking-tight">JobCraft</h1>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-300">
                {data.profile.mode === "auto_apply_smart"
                  ? `Auto-Apply ≥ ${data.profile.min_match_score}%`
                  : data.profile.mode}
              </span>
              {importedEvents.length > 0 && (
                <button
                  type="button"
                  onClick={clearImported}
                  title="Remover eventos importados localmente no navegador"
                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
                >
                  +{importedEvents.length} importado(s) ✕
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Hoje:{" "}
              <span className="font-mono text-zinc-200">
                {data.stats.today_sent.national}/{data.profile.daily_limits.national}
              </span>{" "}
              BR ·{" "}
              <span className="font-mono text-zinc-200">
                {data.stats.today_sent.international}/{data.profile.daily_limits.international}
              </span>{" "}
              Int · {data.profile.cvs_count} PDFs ATS · Atualizado às{" "}
              <span className="font-mono text-zinc-300">{formatTime(data.last_updated)}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.json"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleImportFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition cursor-pointer focus:outline-none focus:border-zinc-500"
            >
              Importar .jsonl
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 transition cursor-pointer focus:outline-none focus:border-zinc-500"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              aria-pressed={autoRefresh}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer focus:outline-none focus:border-zinc-500 ${
                autoRefresh
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
              title="Atualizar automaticamente a cada 15 segundos"
            >
              {autoRefresh ? "Auto 15s: ON" : "Auto 15s"}
            </button>
            <a
              href={NOTION_PIPELINE_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition focus:outline-none focus:border-zinc-500"
            >
              Abrir Notion ↗
            </a>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            >
              {loading ? "Atualizando..." : "Atualizar agora"}
            </button>
          </div>
        </div>
        {errorMsg && (
          <div className="border-t border-rose-500/30 bg-rose-500/10 px-4 sm:px-6 py-1.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              label: "Total Mapeadas",
              value: data.stats.total,
              accent: "text-zinc-100",
              sub: data.stats.discarded > 0 ? `${data.stats.discarded} descartada(s)` : undefined,
            },
            { label: "Enviadas", value: data.stats.sent, accent: "text-emerald-300" },
            { label: "Em Revisão / Dry-Run", value: data.stats.review, accent: "text-amber-300" },
            { label: "Bloqueadas / Login", value: data.stats.blocked, accent: "text-rose-300" },
            {
              label: "Match Médio",
              value: `${data.stats.avg_match}%`,
              accent: "text-sky-300",
              spanMobile: true,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4 flex flex-col justify-between ${
                kpi.spanMobile ? "col-span-2 md:col-span-1" : ""
              }`}
            >
              <div className="text-xs text-zinc-400">{kpi.label}</div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <div className={`text-2xl font-semibold tabular-nums ${kpi.accent}`}>
                  {kpi.value}
                </div>
                {kpi.sub && <span className="text-[11px] text-zinc-400">{kpi.sub}</span>}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="Buscar vaga, empresa ou plataforma"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vaga, empresa, plataforma ou modelo..."
            className="flex-1 min-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500"
          />
          <select
            aria-label="Filtrar por track"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="ALL">Todos os Tracks</option>
            {data.profile.tracks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por plataforma"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="ALL">Todas as Plataformas</option>
            {platformOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="ALL">Todos os Status</option>
            <option value="SENT">Enviadas</option>
            <option value="REVIEW">Em Revisão / Dry-Run</option>
            <option value="BLOCKED">Bloqueadas / Login</option>
            <option value="DISCARDED">Descartadas</option>
          </select>
          <select
            aria-label="Ordenar vagas"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          >
            <option value="recent">Mais recentes</option>
            <option value="score_desc">Maior Match Score</option>
            <option value="company_asc">Empresa (A–Z)</option>
          </select>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-200">
                Pipeline de Vagas ({filtered.length})
              </h2>
              <span className="text-xs text-zinc-400 font-mono truncate max-w-full">
                ~/.gemini/job-copilot/runs/*.jsonl
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-zinc-300">
                  {data.jobs.length === 0
                    ? "Nenhuma vaga carregada ainda. Importe seus arquivos .jsonl ou conecte o sync automático."
                    : "Nenhuma vaga encontrada com os filtros atuais."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition cursor-pointer focus:outline-none focus:border-zinc-500"
                    >
                      Limpar filtros
                    </button>
                  )}
                  {data.jobs.length === 0 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition cursor-pointer"
                    >
                      Importar .jsonl agora
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {filtered.map((job) => {
                  const isActive = activeSelected?.id === job.id;
                  return (
                    <div
                      key={job.id}
                      className={`relative p-4 transition hover:bg-zinc-900/90 ${
                        isActive ? "bg-zinc-900/90" : ""
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r bg-emerald-400"
                        />
                      )}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(job.id)}
                          className="text-left flex-1 min-w-[200px] cursor-pointer focus:outline-none group"
                        >
                          <div className="font-medium text-sm text-zinc-100 group-hover:text-emerald-300 group-focus-visible:underline transition-colors">
                            {job.job_title}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {job.company} · {job.platform} · {job.work_model} · {job.language}
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-mono tabular-nums ${scoreTone(
                              job.match_score,
                              data.profile.min_match_score
                            )}`}
                          >
                            {job.match_score}%
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs ${statusTone(
                              job.latest_status
                            )}`}
                          >
                            {job.latest_status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                        <span>
                          Track: <strong className="text-zinc-200">{job.track}</strong> ·{" "}
                          {job.timeline.length} passo(s)
                        </span>
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline focus:outline-none focus:underline"
                        >
                          Ver vaga ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 h-fit lg:sticky lg:top-24">
            <h2 className="text-sm font-medium text-zinc-200 pb-3 border-b border-zinc-800/80">
              Passos Executados (Timeline)
            </h2>
            {!activeSelected ? (
              <p className="text-xs text-zinc-400 mt-4">
                {filtered.length === 0
                  ? "Ajuste ou limpe os filtros para visualizar a timeline de uma vaga."
                  : "Selecione uma vaga para ver os passos executados pelo agente."}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {activeSelected.job_title}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {activeSelected.company} · {activeSelected.track}
                  </div>
                </div>

                <ol className="space-y-4">
                  {activeSelected.timeline.map((ev, idx) => {
                    const isLast = idx === activeSelected.timeline.length - 1;
                    return (
                      <li key={`${ev.timestamp}-${idx}`} className="relative pl-6">
                        {!isLast && (
                          <span
                            aria-hidden="true"
                            className="absolute left-[7px] top-3 -bottom-4 w-px bg-zinc-800"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className="absolute left-[7px] top-1.5 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-zinc-900"
                        />
                        <div className="text-xs font-medium text-zinc-200">{ev.step}</div>
                        <div className="text-xs text-zinc-300">{ev.status}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {formatDate(ev.timestamp)}
                        </div>
                        {ev.screenshot_path && (
                          <div className="mt-1 rounded bg-zinc-800/80 border border-zinc-700/80 px-2 py-1 text-[11px] text-zinc-300 font-mono truncate">
                            Captura: {ev.screenshot_path}
                          </div>
                        )}
                        {ev.error_reason && (
                          <div className="mt-1 rounded bg-rose-500/10 border border-rose-500/20 px-2 py-1 text-[11px] text-rose-300">
                            {ev.error_reason}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
