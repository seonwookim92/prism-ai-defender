import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const controller = new AbortController();
        // 12s: gives backend time to start up (DB init + sync_env can take ~10s)
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(`${process.env.BACKEND_URL}/api/onboarding/status`, {
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error("Onboarding status proxy error:", error);
        // Include env-level hints so Settings page can still partially populate
        return NextResponse.json({
            onboarded: true,
            config: null,
            retryable: true,
            error: error instanceof Error ? error.message : String(error),
            env_hints: {
                llm_provider: process.env.LLM_PROVIDER || "openai",
                llm_configs: {
                    openai: { apiKey: process.env.OPENAI_API_KEY || "", model: "gpt-4o" },
                    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY || "", model: "claude-3-5-sonnet-20240620" },
                    google: { apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "", model: "gemini-1.5-flash" }
                },
                wazuh: {
                    host: process.env.WAZUH_API_HOST || "localhost",
                    port: parseInt(process.env.WAZUH_API_PORT || "55000", 10),
                    user: process.env.WAZUH_API_USERNAME || "wazuh",
                    pass: process.env.WAZUH_API_PASSWORD || "",
                    indexer_host: process.env.WAZUH_INDEXER_HOST || "",
                    indexer_port: parseInt(process.env.WAZUH_INDEXER_PORT || "9200", 10),
                    indexer_user: process.env.WAZUH_INDEXER_USERNAME || "",
                    indexer_pass: process.env.WAZUH_INDEXER_PASSWORD || ""
                },
                falcon: {
                    client_id: process.env.FALCON_CLIENT_ID || "",
                    client_secret: process.env.FALCON_CLIENT_SECRET || "",
                    base_url: process.env.FALCON_BASE_URL || "https://api.crowdstrike.com"
                }
            }
        }, { status: 503 });
    }
}
