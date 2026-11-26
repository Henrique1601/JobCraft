export interface RunEvent {
  timestamp: string;
  job_title: string;
  company: string;
  platform: string;
  track: string;
  language: string;
  work_model: string;
  match_score: number;
  step: string;
  status: string;
  job_url: string;
  screenshot_path?: string;
  error_reason?: string;
}

export interface JobRecord {
  id: string;
  job_title: string;
  company: string;
  platform: string;
  track: string;
  language: string;
  work_model: string;
  match_score: number;
  latest_step: string;
  latest_status: string;
  job_url: string;
  updated_at: string;
  error_reason?: string;
  timeline: {
    timestamp: string;
    step: string;
    status: string;
    error_reason?: string;
    screenshot_path?: string;
  }[];
}

export interface ProfileSummary {
  mode: string;
  min_match_score: number;
  daily_limits: { national: number; international: number };
  tracks: string[];
  cvs_count: number;
}

export interface DashboardData {
  jobs: JobRecord[];
  stats: {
    total: number;
    sent: number;
    review: number;
    blocked: number;
    discarded: number;
    avg_match: number;
    today_sent: {
      national: number;
      international: number;
    };
  };
  profile: ProfileSummary;
  last_updated: string;
}

export const DEFAULT_PROFILE: ProfileSummary = {
  mode: "auto_apply_smart",
  min_match_score: 80,
  daily_limits: { national: 10, international: 10 },
  tracks: ["Full-Stack", "Front-End", "Back-End", "AI Engineer"],
  cvs_count: 0,
};

export const SENT_STATUS_RE = /enviada|submitted/i;
export const BLOCKED_STATUS_RE = /bloquead|captcha|login|erro/i;
export const DISCARDED_STATUS_RE = /descartad/i;

export function parseJsonl(content: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<RunEvent>;
      if (parsed && typeof parsed === "object" && parsed.job_title && parsed.company) {
        events.push({
          timestamp: String(parsed.timestamp || new Date().toISOString()),
          job_title: String(parsed.job_title),
          company: String(parsed.company),
          platform: String(parsed.platform || "Desconhecida"),
          track: String(parsed.track || "Full-Stack"),
          language: String(parsed.language || "PT-BR"),
          work_model: String(parsed.work_model || "Remoto"),
          match_score: Number(parsed.match_score || 0),
          step: String(parsed.step || "step"),
          status: String(parsed.status || "pending"),
          job_url: String(parsed.job_url || ""),
          screenshot_path: parsed.screenshot_path ? String(parsed.screenshot_path) : undefined,
          error_reason: parsed.error_reason ? String(parsed.error_reason) : undefined,
        });
      }
    } catch {
      // Skip malformed lines without crashing dashboard
    }
  }
  return events;
}

function isNationalJob(job: JobRecord): boolean {
  return /pt|br|portugu/i.test(job.language);
}

export function aggregateEvents(
  events: RunEvent[],
  profile: ProfileSummary = DEFAULT_PROFILE,
  now: Date = new Date()
): DashboardData {
  const byUrl = new Map<string, JobRecord>();

  for (const ev of events) {
    const key = ev.job_url || `${ev.company}::${ev.job_title}`;
    const existing = byUrl.get(key);
    const stepEntry = {
      timestamp: ev.timestamp,
      step: ev.step,
      status: ev.status,
      error_reason: ev.error_reason || undefined,
      screenshot_path: ev.screenshot_path || undefined,
    };

    if (!existing) {
      byUrl.set(key, {
        id: key,
        job_title: ev.job_title,
        company: ev.company,
        platform: ev.platform,
        track: ev.track,
        language: ev.language,
        work_model: ev.work_model,
        match_score: Number(ev.match_score || 0),
        latest_step: ev.step,
        latest_status: ev.status,
        job_url: ev.job_url,
        updated_at: ev.timestamp,
        error_reason: ev.error_reason || undefined,
        timeline: [stepEntry],
      });
    } else {
      existing.timeline.push(stepEntry);
      if (ev.timestamp >= existing.updated_at) {
        existing.latest_step = ev.step;
        existing.latest_status = ev.status;
        existing.updated_at = ev.timestamp;
        existing.match_score = Number(ev.match_score || existing.match_score);
        existing.error_reason = ev.error_reason || existing.error_reason;
      }
    }
  }

  const jobs = Array.from(byUrl.values()).sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );

  const sentJobs = jobs.filter((j) => SENT_STATUS_RE.test(j.latest_status));
  const sent = sentJobs.length;
  const blocked = jobs.filter((j) => BLOCKED_STATUS_RE.test(j.latest_status)).length;
  const discarded = jobs.filter((j) => DISCARDED_STATUS_RE.test(j.latest_status)).length;
  const review = jobs.length - sent - blocked - discarded;
  const avgMatch =
    jobs.length > 0
      ? Math.round(jobs.reduce((acc, j) => acc + j.match_score, 0) / jobs.length)
      : 0;

  const todayPrefix = now.toISOString().slice(0, 10);
  const todaySentJobs = sentJobs.filter((j) => j.updated_at.slice(0, 10) === todayPrefix);
  const todayNational = todaySentJobs.filter(isNationalJob).length;
  const todayInternational = todaySentJobs.length - todayNational;

  return {
    jobs,
    stats: {
      total: jobs.length,
      sent,
      review,
      blocked,
      discarded,
      avg_match: avgMatch,
      today_sent: {
        national: todayNational,
        international: todayInternational,
      },
    },
    profile,
    last_updated: now.toISOString(),
  };
}
