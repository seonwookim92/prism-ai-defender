import { NextResponse } from 'next/server';

const FALLBACK_PROVIDERS = {
    providers: [
        { id: "openai", name: "OpenAI", models: ["gpt-5-mini", "o3-mini", "gpt-4o"], hasApiKey: false },
        { id: "anthropic", name: "Anthropic", models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"], hasApiKey: false },
        { id: "google", name: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"], hasApiKey: false },
        { id: "ollama", name: "Ollama (Local)", models: [], hasApiKey: false }
    ]
};

export async function GET() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(`${process.env.BACKEND_URL}/api/llm/providers`, {
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
        console.error("LLM providers proxy error:", error);
        return NextResponse.json(FALLBACK_PROVIDERS);
    }
}
