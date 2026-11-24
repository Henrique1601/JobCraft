import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/runs";

export async function GET() {
  const data = loadDashboardData();
  return NextResponse.json(data);
}
