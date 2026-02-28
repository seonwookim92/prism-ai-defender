from fastapi import FastAPI, Request
import json
import asyncio

app = FastAPI()

@app.get("/")
async def health():
    return {"status": "ok", "service": "falcon-mcp-mock"}

@app.post("/mcp")
@app.post("/mcp/")
async def mcp_handler(request: Request):
    data = await request.json()
    method = data.get("method")
    req_id = data.get("id")

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "result": {
                "tools": [
                    {
                        "name": "falcon_get_agent_security_posture",
                        "description": "Get security posture and risk assessment for a CrowdStrike Falcon agent.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "agent_id": {"type": "string", "description": "The AID of the Falcon agent"}
                            },
                            "required": ["agent_id"]
                        }
                    }
                ]
            },
            "id": req_id
        }

    if method == "tools/call":
        tool_name = data["params"]["name"]
        arguments = data["params"]["arguments"]
        return {
            "jsonrpc": "2.0",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": f"Executed {tool_name} on Falcon (Standalone Mock)"
                    }
                ]
            },
            "id": req_id
        }

    return {
        "jsonrpc": "2.0",
        "error": {"code": -32601, "message": "Method not found"},
        "id": req_id
    }

# Backwards compatibility / legacy
@app.post("/call")
async def call_tool(request: Request):
    data = await request.json()
    tool_name = data["params"]["name"]
    return {
        "jsonrpc": "2.0",
        "result": {
            "content": [{"type": "text", "text": f"Legacy execute {tool_name}"}]
        },
        "id": data["id"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
