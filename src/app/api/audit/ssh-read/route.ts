import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
    const ctrl = new AbortController();
    // 45s: SSH connect + wc -l + sed can take time on large files
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
        const body = await req.text();
        const res = await fetch(`${BACKEND}/api/audit/ssh-read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: ctrl.signal,
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 503 });
    } finally {
        clearTimeout(timer);
    }
}
