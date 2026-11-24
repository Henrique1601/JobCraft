"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardData, JobRecord } from "@/lib/runs";

const NOTION_PIPELINE_URL =
  "https://app.notion.com/p/Candidaturas-Pipeline-de-Vagas-41d37ba8664981349f8cef6ba427c3ee";

function statusTone(status: string): string {
  if (/enviada|submitted/i.test(status)) {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  if (/bloquead|captcha|login|erro/i.test(status)) {
    return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
  if (/descartad/i.test(status)) {
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

export default function DashboardClient({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(initial.jobs[0]?.id ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/runs", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }
      const next: DashboardData = await res.json();
      setData(next);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.jobs.filter((j) => {
      if (trackFilter !== "ALL" && j.track !== trackFilter) return false;
      if (statusFilter !== "ALL") {
        if (statusFilter === "SENT" && !/enviada|submitted/i.test(j.latest_status)) return false;
        if (statusFilter === "BLOCKED" && !/bloquead|captcha|login|erro/i.test(j.latest_status))
          return false;
        if (statusFilter === "DISCARDED" && !/descartad/i.test(j.latest_status)) return false;
        if (
          statusFilter === "REVIEW" &&
          /enviada|submitted|bloquead|captcha|login|erro|descartad/i.test(j.latest_status)
        )
          return false;
      }
      if (!q) return true;
      return (
        j.job_title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.platform.toLowerCase().includes(q)
      );
    });
  }, [data.jobs, query, trackFilter, statusFilter]);

  const activeSelected: JobRecord | null = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.find((j) => j.id === selectedId) ?? filtered[0];
  }, [filtered, selectedId]);

  const hasActiveFilters = query.trim() !== "" || trackFilter !== "ALL" || statusFilter !== "ALL";

  function clearFilters() {
    setQuery("");
    setTrackFilter("ALL");
    setStatusFilter("ALL");
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
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Limite diário: {data.profile.daily_limits.national} BR +{" "}
              {data.profile.daily_limits.international} Internacional · {data.profile.cvs_count} PDFs
              ATS prontos · Atualizado às{" "}
              <span className="font-mono text-zinc-300">{formatTime(data.last_updated)}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
            { label: "Total Mapeadas", value: data.stats.total, accent: "text-zinc-100" },
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
              <div className={`text-2xl font-semibold tabular-nums mt-2 ${kpi.accent}`}>
                {kpi.value}
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
            placeholder="Buscar vaga, empresa ou plataforma..."
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
                  Nenhuma vaga encontrada com os filtros atuais.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition cursor-pointer focus:outline-none focus:border-zinc-500"
                  >
                    Limpar filtros
                  </button>
                )}
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
