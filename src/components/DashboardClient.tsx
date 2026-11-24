"use client";

import { useMemo, useState } from "react";
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
    return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
  return "bg-amber-500/15 text-amber-300 border-amber-500/30";
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

export default function DashboardClient({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<JobRecord | null>(initial.jobs[0] ?? null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/runs", { cache: "no-store" });
      if (res.ok) {
        const next: DashboardData = await res.json();
        setData(next);
        if (next.jobs.length > 0) {
          setSelected((prev) =>
            next.jobs.find((j) => j.id === prev?.id) ?? next.jobs[0]
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.jobs.filter((j) => {
      if (trackFilter !== "ALL" && j.track !== trackFilter) return false;
      if (statusFilter !== "ALL") {
        if (statusFilter === "SENT" && !/enviada|submitted/i.test(j.latest_status)) return false;
        if (statusFilter === "BLOCKED" && !/bloquead|captcha|login|erro/i.test(j.latest_status))
          return false;
        if (
          statusFilter === "REVIEW" &&
          (/enviada|submitted|bloquead|captcha|login|erro|descartad/i.test(j.latest_status))
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
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
              ATS prontos
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href={NOTION_PIPELINE_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition"
            >
              Abrir Notion ↗
            </a>
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? "Atualizando..." : "Atualizar agora"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Mapeadas", value: data.stats.total, accent: "text-zinc-100" },
            { label: "Enviadas", value: data.stats.sent, accent: "text-emerald-300" },
            { label: "Em Revisão / Dry-Run", value: data.stats.review, accent: "text-amber-300" },
            { label: "Bloqueadas / Login", value: data.stats.blocked, accent: "text-rose-300" },
            { label: "Match Médio", value: `${data.stats.avg_match}%`, accent: "text-sky-300" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4"
            >
              <div className="text-xs text-zinc-400">{kpi.label}</div>
              <div className={`text-2xl font-semibold tabular-nums mt-1 ${kpi.accent}`}>
                {kpi.value}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar vaga, empresa ou plataforma..."
            className="flex-1 min-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="ALL">Todos os Tracks</option>
            {data.profile.tracks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="ALL">Todos os Status</option>
            <option value="SENT">Enviadas</option>
            <option value="REVIEW">Em Revisão / Dry-Run</option>
            <option value="BLOCKED">Bloqueadas / Login</option>
          </select>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-200">
                Pipeline de Vagas ({filtered.length})
              </h2>
              <span className="text-xs text-zinc-500">
                Fonte: ~/.gemini/job-copilot/runs/*.jsonl
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhuma vaga encontrada com os filtros atuais.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {filtered.map((job) => {
                  const isActive = selected?.id === job.id;
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelected(job)}
                      className={`p-4 cursor-pointer transition hover:bg-zinc-900/90 ${
                        isActive ? "bg-zinc-900/90 border-l-2 border-l-emerald-400" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm text-zinc-100">{job.job_title}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {job.company} · {job.platform} · {job.work_model} · {job.language}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-200 tabular-nums">
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
                      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          Track: <strong className="text-zinc-300">{job.track}</strong> ·{" "}
                          {job.timeline.length} passo(s)
                        </span>
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-emerald-400 hover:underline"
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

          <aside className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 h-fit">
            <h2 className="text-sm font-medium text-zinc-200 pb-3 border-b border-zinc-800/80">
              Passos Executados (Timeline)
            </h2>
            {!selected ? (
              <p className="text-xs text-zinc-500 mt-4">
                Selecione uma vaga para ver os passos executados pelo agente.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{selected.job_title}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {selected.company} · {selected.track}
                  </div>
                </div>

                <ol className="relative border-l border-zinc-800 ml-2 space-y-4 pl-4">
                  {selected.timeline.map((ev, idx) => (
                    <li key={`${ev.timestamp}-${idx}`} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-zinc-950" />
                      <div className="text-xs font-medium text-zinc-200">{ev.step}</div>
                      <div className="text-xs text-zinc-400">{ev.status}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {formatDate(ev.timestamp)}
                      </div>
                      {ev.error_reason && (
                        <div className="mt-1 rounded bg-rose-500/10 border border-rose-500/20 px-2 py-1 text-[11px] text-rose-300">
                          {ev.error_reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
