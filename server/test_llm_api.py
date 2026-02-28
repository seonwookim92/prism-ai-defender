import asyncio
import httpx

async def test_apis():
    async with httpx.AsyncClient() as client:
        # OpenAI
        r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": "Bearer nones"}, timeout=3.0)
        print("OpenAI:", r.status_code)

        # Anthropic
        r = await client.get("https://api.anthropic.com/v1/models", headers={"x-api-key": "nones", "anthropic-version": "2023-06-01"}, timeout=3.0)
        print("Anthropic:", r.status_code)

        # Gemini
        r = await client.get("https://generativelanguage.googleapis.com/v1beta/models?key=none", timeout=3.0)
        print("Gemini:", r.status_code)

asyncio.run(test_apis())
