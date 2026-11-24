import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  };
  profile: ProfileSummary;
  last_updated: string;
}

function getBaseDir(): string {
  return process.env.JOB_COPILOT_DIR || path.join(os.homedir(), ".gemini", "job-copilot");
}

function readProfileSummary(baseDir: string): ProfileSummary {
  const fallback: ProfileSummary = {
    mode: "auto_apply_smart",
    min_match_score: 80,
    daily_limits: { national: 10, international: 10 },
    tracks: ["Full-Stack", "Front-End", "Back-End", "AI Engineer"],
    cvs_count: 0,
  };

  try {
    const cvsDir = path.join(baseDir, "cvs");
    const cvsCount = fs.existsSync(cvsDir)
      ? fs.readdirSync(cvsDir).filter((f) => f.toLowerCase().endsWith(".pdf")).length
      : 0;

    const profilePath = path.join(baseDir, "master-profile.json");
    if (!fs.existsSync(profilePath)) {
      return { ...fallback, cvs_count: cvsCount };
    }
    const raw = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    const t = raw.targeting || {};
    return {
      mode: String(t.mode || fallback.mode),
      min_match_score: Number(t.min_match_score ?? fallback.min_match_score),
      daily_limits: {
        national: Number(t.daily_limits?.national ?? 10),
        international: Number(t.daily_limits?.international ?? 10),
      },
      tracks: Array.isArray(t.tracks) ? t.tracks : fallback.tracks,
      cvs_count: cvsCount,
    };
  } catch {
    return fallback;
  }
}

export function loadDashboardData(): DashboardData {
  const baseDir = getBaseDir();
  const runsDir = path.join(baseDir, "runs");
  const events: RunEvent[] = [];

  if (fs.existsSync(runsDir)) {
    const files = fs
      .readdirSync(runsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(runsDir, file), "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as RunEvent);
        } catch {
          // Skip malformed lines without crashing dashboard
        }
      }
    }
  }

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

  const sent = jobs.filter((j) => /enviada|submitted/i.test(j.latest_status)).length;
  const blocked = jobs.filter((j) => /bloquead|captcha|login|erro/i.test(j.latest_status)).length;
  const discarded = jobs.filter((j) => /descartad/i.test(j.latest_status)).length;
  const review = jobs.length - sent - blocked - discarded;
  const avgMatch =
    jobs.length > 0
      ? Math.round(jobs.reduce((acc, j) => acc + j.match_score, 0) / jobs.length)
      : 0;

  return {
    jobs,
    stats: {
      total: jobs.length,
      sent,
      review,
      blocked,
      discarded,
      avg_match: avgMatch,
    },
    profile: readProfileSummary(baseDir),
    last_updated: new Date().toISOString(),
  };
}
