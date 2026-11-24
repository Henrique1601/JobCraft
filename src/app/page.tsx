import { Suspense } from "react";
import { connection } from "next/server";
import DashboardClient from "@/components/DashboardClient";
import { loadDashboardData } from "@/lib/runs";

async function DashboardLoader() {
  await connection();
  const initial = loadDashboardData();
  return <DashboardClient initial={initial} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
          Carregando JobCraft...
        </div>
      }
    >
      <DashboardLoader />
    </Suspense>
  );
}
