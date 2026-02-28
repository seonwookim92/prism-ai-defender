import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch(`${process.env.BACKEND_URL}/api/dashboard/stats`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("Dashboard stats proxy error:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : String(error),
            status: "error",
            asset_count: 0,
            monitoring: { total_tasks: 0, summary: { green: 0, amber: 0, red: 0, error: 0 } },
            alerts: [],
            integrations: { wazuh: "offline", falcon: "offline", velociraptor: "offline" }
        }, { status: 500 });
    }
}
