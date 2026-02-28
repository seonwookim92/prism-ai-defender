from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import uvicorn
import json
import asyncio
import httpx
import paramiko
import re
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from redis import Redis
from rq import Queue
from datetime import datetime, timedelta
from dotenv import load_dotenv
import traceback
import shlex

# Load .env file
load_dotenv()

from models import init_db, get_db, SystemConfig, SessionLocal, MonitoringTask, MonitoringResult, Playbook
from builder import builder_reasoning
from mcp_dispatcher import dispatcher
from worker import run_security_audit
from sync_env import sync as sync_environment

async def monitoring_scheduler():
    """Background loop that directly executes monitoring tasks on schedule."""
    from monitor_runner import execute_monitoring_task

    # Wait a few seconds on startup for DB to be ready
    await asyncio.sleep(5)
    print("[Scheduler] Monitoring scheduler started.")

    while True:
        try:
            async with SessionLocal() as db:
                now = datetime.utcnow()
                result = await db.execute(
                    select(MonitoringTask).filter(MonitoringTask.enabled == True)
                )
                tasks = result.scalars().all()

                for task in tasks:
                    should_run = False
                    if not task.last_run:
                        should_run = True
                    else:
                        diff = (now - task.last_run).total_seconds() / 60
                        if diff >= task.interval_minutes:
                            should_run = True

                    if should_run:
                        print(f"[Scheduler] Running monitoring task: {task.title} (ID: {task.id})")
                        try:
                            await execute_monitoring_task(task.id)
                        except Exception as task_err:
                            print(f"[Scheduler] Task {task.id} execution error: {task_err}")

        except Exception as e:
            import traceback
            print(f"[Scheduler] Error: {e}")
            traceback.print_exc()

        await asyncio.sleep(60)  # Check every minute

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        await sync_environment()
    except Exception as e:
        print(f"Error syncing environment: {e}")
    scheduler_task = asyncio.create_task(monitoring_scheduler())
    yield
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="PRISM AI Defender Control Plane", lifespan=lifespan)

# Redis & RQ Queue
redis_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
redis_conn = Redis.from_url(redis_url)
job_queue = Queue('default', connection=redis_conn)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    messages: Optional[List[dict]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    mode: Optional[str] = "ops"

class ChatResponse(BaseModel):
    response: str

class OnboardingRequest(BaseModel):
    llmConfigs: dict
    llmProvider: Optional[str] = "openai"
    llmModel: Optional[str] = "gpt-4o"
    assets: List[dict]
    wazuhConfig: dict
    falconConfig: dict
    keystore: Optional[List[dict]] = []

class ConfigUpdateRequest(BaseModel):
    provider: str
    model: str

class OnboardingSetupRequest(BaseModel):
    llmProvider: str
    llmModel: str
    llmConfigs: dict
    assets: List[dict]
    keystore: Optional[List[dict]] = []
    wazuhConfig: Optional[dict] = {}
    falconConfig: Optional[dict] = {}
    velociraptorConfig: Optional[dict] = {}
    tavilyConfig: Optional[dict] = {}
    wazuhEnabled: Optional[bool] = True
    falconEnabled: Optional[bool] = True
    velociraptorEnabled: Optional[bool] = True
    tavilyEnabled: Optional[bool] = True

class MonitoringTaskCreate(BaseModel):
    title: str
    toolName: str
    toolArgs: dict
    thresholdCondition: Optional[str] = None
    intervalMinutes: int = 5
    targetAgents: Optional[List[str]] = []  # List of asset IPs/names selected from UI
    actionToolName: Optional[str] = None
    actionToolArgs: Optional[str] = None # JSON string with templates

class MonitoringTaskUpdate(BaseModel):
    title: Optional[str] = None
    toolName: Optional[str] = None
    toolArgs: Optional[dict] = None
    thresholdCondition: Optional[str] = None
    intervalMinutes: Optional[int] = None
    targetAgents: Optional[List[str]] = None
    actionToolName: Optional[str] = None
    actionToolArgs: Optional[str] = None
    enabled: Optional[bool] = None

class PlaybookSaveRequest(BaseModel):
    name: str
    blocks: list = []

class AuditSSHReadRequest(BaseModel):
    ip: str
    file_path: str
    start_line: int = 1
    end_line: int = 600

class AuditVerifyPathRequest(BaseModel):
    ip: str
    file_path: str

@app.get("/api/monitoring/tasks")
async def list_monitoring_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonitoringTask).order_by(MonitoringTask.created_at.desc()))
    tasks = result.scalars().all()
    
    # Enrich with latest status
    enriched = []
    for task in tasks:
        res_query = await db.execute(
            select(MonitoringResult)
            .filter(MonitoringResult.task_id == task.id)
            .order_by(MonitoringResult.timestamp.desc())
            .limit(1)
        )
        latest_res = res_query.scalar_one_or_none()
        # Parse targetAgents from target_agent column
        raw_ta = task.target_agent or "all"
        try:
            target_agents = json.loads(raw_ta) if raw_ta != "all" else []
            if isinstance(target_agents, str):
                target_agents = [target_agents] if target_agents else []
        except Exception:
            target_agents = [raw_ta] if raw_ta != "all" else []

        enriched.append({
            "id": task.id,
            "title": task.title,
            "toolName": task.tool_name,
            "toolArgs": json.loads(task.tool_args),
            "thresholdCondition": task.threshold_condition,
            "intervalMinutes": task.interval_minutes,
            "enabled": task.enabled,
            "targetAgents": target_agents,
            "actionToolName": task.action_tool_name,
            "actionToolArgs": task.action_tool_args,
            "status": latest_res.status if latest_res else "unknown",
            "lastRun": task.last_run.isoformat() + "Z" if task.last_run else None
        })
    return enriched

@app.get("/api/mcp/tools")
async def list_mcp_tools():
    try:
        from mcp_dispatcher import dispatcher
        tools = await dispatcher.list_tools()
        return {"tools": tools}
    except Exception as e:
        return {"error": str(e), "tools": []}

@app.post("/api/monitoring/tasks")
async def create_monitoring_task(request: MonitoringTaskCreate, db: AsyncSession = Depends(get_db)):
    # Store targetAgents as JSON array string in target_agent column
    target_agent_str = json.dumps(request.targetAgents) if request.targetAgents else "all"
    task = MonitoringTask(
        title=request.title,
        tool_name=request.toolName,
        tool_args=json.dumps(request.toolArgs),
        threshold_condition=request.thresholdCondition,
        interval_minutes=request.intervalMinutes,
        target_agent=target_agent_str,
        action_tool_name=request.actionToolName,
        action_tool_args=request.actionToolArgs
    )
    db.add(task)
    await db.commit()
    return {"id": task.id, "status": "created"}

@app.patch("/api/monitoring/tasks/{task_id}")
async def update_monitoring_task(task_id: int, request: MonitoringTaskUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MonitoringTask).filter(MonitoringTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if request.title is not None:
        task.title = request.title
    if request.toolName is not None:
        task.tool_name = request.toolName
    if request.toolArgs is not None:
        task.tool_args = json.dumps(request.toolArgs)
    if request.thresholdCondition is not None:
        task.threshold_condition = request.thresholdCondition
    if request.intervalMinutes is not None:
        task.interval_minutes = request.intervalMinutes
    if request.targetAgents is not None:
        task.target_agent = json.dumps(request.targetAgents) if request.targetAgents else "all"
    if request.actionToolName is not None:
        task.action_tool_name = request.actionToolName
    if request.actionToolArgs is not None:
        task.action_tool_args = request.actionToolArgs
    if request.enabled is not None:
        task.enabled = request.enabled
        
    await db.commit()
    return {"status": "updated"}

@app.delete("/api/monitoring/tasks/{task_id}")
async def delete_monitoring_task(task_id: int, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import delete
    await db.execute(delete(MonitoringResult).where(MonitoringResult.task_id == task_id))
    await db.execute(delete(MonitoringTask).where(MonitoringTask.id == task_id))
    await db.commit()
    return {"status": "deleted"}

@app.get("/api/monitoring/results/{task_id}")
async def get_monitoring_results(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonitoringResult)
        .filter(MonitoringResult.task_id == task_id)
        .order_by(MonitoringResult.timestamp.desc())
        .limit(5)
    )
    results = result.scalars().all()
    items = []
    for r in results:
        try:
            data = json.loads(r.result_data)
        except:
            data = {"raw": r.result_data}
        items.append({
            "id": r.id,
            "status": r.status,
            "resultData": data,
            "timestamp": r.timestamp.isoformat() + "Z"
        })
    return items

_providers_cache = {"data": None, "expiry": None}
CACHE_DURATION = timedelta(minutes=5)
FETCH_LOCK = asyncio.Lock()
FETCHING_TASK = None # Track background fetching task

@app.get("/api/llm/providers")
async def get_llm_providers(ollama_url: str = None):
    global _providers_cache, FETCHING_TASK

    # 1. Non-blocking Cache Check
    now = datetime.utcnow()
    if not ollama_url and _providers_cache["data"] and _providers_cache["expiry"] > now:
        return _providers_cache["data"]

    # 2. Quick API key check from env vars (for immediate response)
    def has_env_key(env_var: str) -> bool:
        val = os.getenv(env_var, "")
        if not val or not val.strip():
            return False
        v = val.strip().lower()
        # Reject placeholder values from .env.sample
        if v.startswith("your_") or v.startswith("your-"):
            return False
        if v.startswith("<") and v.endswith(">"):
            return False
        if v in ("placeholder", "changeme", "example", "xxx", "sk-...", "none", "null"):
            return False
        return True

    # 2b. Quick fetch from DB for real-time hasApiKey sync
    db_configs = {}
    try:
        async with SessionLocal() as session:
            res = await session.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
            config_row = res.scalar_one_or_none()
            if config_row and config_row.llm_configs:
                db_configs = json.loads(config_row.llm_configs)
    except: pass

    def _valid_key(k: str | None) -> str | None:
        if not k or not k.strip(): return None
        v = k.strip().lower()
        if v.startswith("your_") or v.startswith("your-") or (v.startswith("<") and v.endswith(">")): return None
        if v in ("placeholder", "changeme", "example", "xxx", "sk-...", "none", "null"): return None
        return k.strip()

    def has_any_key(provider_id: str, env_var: str) -> bool:
        # Check DB first, then ENV
        db_key = _valid_key(db_configs.get(provider_id, {}).get("apiKey"))
        if db_key: return True
        return has_env_key(env_var)

    # 3. Define Curated Defaults with hasApiKey (returned immediately if cache empty)
    curated_providers = [
        {
            "id": "openai", "name": "OpenAI",
            "models": ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini"],
            "hasApiKey": has_any_key("openai", "OPENAI_API_KEY")
        },
        {
            "id": "anthropic", "name": "Anthropic",
            "models": ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
            "hasApiKey": has_any_key("anthropic", "ANTHROPIC_API_KEY")
        },
        {
            "id": "google", "name": "Google Gemini",
            "models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
            "hasApiKey": has_any_key("google", "GOOGLE_GENERATIVE_AI_API_KEY")
        },
        {
            "id": "ollama", "name": "Ollama (Local)",
            "models": ["qwen2.5-coder", "llama3.2", "mistral"],
            "hasApiKey": True  # No API key needed for local
        }
    ]

    # 4. If no active background fetch, start one
    if not FETCHING_TASK or FETCHING_TASK.done() or ollama_url:
        async def background_fetch(manual_ollama_url=None):
            global _providers_cache
            try:
                # Local copy for background update
                updated_providers = [p.copy() for p in curated_providers]
                p_map = {p["id"]: p for p in updated_providers}

                # Get keys from DB without holding session too long
                async with SessionLocal() as session:
                    res = await session.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
                    config = res.scalar_one_or_none()
                    llm_configs = json.loads(config.llm_configs) if config and config.llm_configs else {}

                def _valid_key(k: str | None) -> str | None:
                    """Return key if it looks real (not placeholder), else None."""
                    if not k or not k.strip():
                        return None
                    v = k.strip().lower()
                    if v.startswith("your_") or v.startswith("your-"):
                        return None
                    if v.startswith("<") and v.endswith(">"):
                        return None
                    if v in ("placeholder", "changeme", "example", "xxx", "sk-...", "none", "null"):
                        return None
                    return k.strip()

                async with httpx.AsyncClient(timeout=3.0) as client:
                    async def f_oai():
                        key = _valid_key(llm_configs.get("openai", {}).get("apiKey")) or _valid_key(os.getenv("OPENAI_API_KEY"))
                        if not key: return
                        try:
                            r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
                            if r.status_code == 200:
                                data = r.json().get("data", [])
                                fetched = [m["id"] for m in data if any(x in m["id"] for x in ["gpt-4o", "o3", "o1"])]
                                p_map["openai"]["hasApiKey"] = True
                                if fetched: p_map["openai"]["models"] = list(dict.fromkeys(p_map["openai"]["models"] + fetched))[:4]
                        except: pass

                    async def f_ant():
                        key = _valid_key(llm_configs.get("anthropic", {}).get("apiKey")) or _valid_key(os.getenv("ANTHROPIC_API_KEY"))
                        if not key: return
                        try:
                            r = await client.get("https://api.anthropic.com/v1/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
                            if r.status_code == 200:
                                data = r.json().get("data", [])
                                fetched = [m["id"] for m in data if "claude" in m["id"]]
                                p_map["anthropic"]["hasApiKey"] = True
                                if fetched: p_map["anthropic"]["models"] = list(dict.fromkeys(p_map["anthropic"]["models"] + fetched))[:4]
                        except: pass

                    async def f_goo():
                        key = _valid_key(llm_configs.get("google", {}).get("apiKey")) or _valid_key(os.getenv("GOOGLE_GENERATIVE_AI_API_KEY"))
                        if not key: return
                        try:
                            r = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
                            if r.status_code == 200:
                                data = r.json().get("models", [])
                                fetched = [m["name"].split("/")[-1] for m in data if "generateContent" in m.get("supportedGenerationMethods", [])]
                                p_map["google"]["hasApiKey"] = True
                                if fetched: p_map["google"]["models"] = list(dict.fromkeys(p_map["google"]["models"] + fetched))[:4]
                        except: pass

                    async def f_oll():
                        urls = []
                        if manual_ollama_url:
                            urls.append(manual_ollama_url)
                        
                        db_url = llm_configs.get("ollama", {}).get("endpoint")
                        if db_url:
                            urls.append(db_url)
                        
                        urls.extend([os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"), "http://host.docker.internal:11434"])
                        
                        for url in urls:
                            try:
                                r = await client.get(f"{url}/api/tags", timeout=1.0)
                                if r.status_code == 200:
                                    models = [m.get("name") for m in r.json().get("models", []) if m.get("name")]
                                    if models:
                                        p_map["ollama"]["models"] = models[:4]
                                        p_map["ollama"]["hasApiKey"] = True
                                        break
                            except: continue

                    await asyncio.gather(f_oai(), f_ant(), f_goo(), f_oll(), return_exceptions=True)

                _providers_cache = {
                    "data": {"providers": updated_providers},
                    "expiry": datetime.utcnow() + CACHE_DURATION
                }
            except Exception as e:
                print(f"[LLM Providers] Background fetch error: {e}")

        if ollama_url:
            await background_fetch(ollama_url)
        else:
            FETCHING_TASK = asyncio.create_task(background_fetch())

    # 5. Immediate Return
    if _providers_cache["data"]:
        return _providers_cache["data"]

    return {"providers": curated_providers}

class JobRequest(BaseModel):
    targetId: str

class ExecuteRequest(BaseModel):
    toolName: str
    toolArgs: dict

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/execute")
async def execute_tool(request: ExecuteRequest):
    try:
        result = await dispatcher.execute(request.toolName, request.toolArgs)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/onboarding/status")
@app.get("/api/config/status")
async def check_onboarding(db: AsyncSession = Depends(get_db)):
    """Consolidated status endpoint for both onboarding and general config."""
    def safe_int(val, default):
        try: return int(val) if val and str(val).strip() else default
        except: return default

    env_hints = {
        "wazuh": {
            "host": os.getenv("WAZUH_API_HOST", "localhost"),
            "port": safe_int(os.getenv("WAZUH_API_PORT"), 55000),
            "user": os.getenv("WAZUH_API_USERNAME", "wazuh"),
            "pass": os.getenv("WAZUH_API_PASSWORD", ""),
            "indexer_host": os.getenv("WAZUH_INDEXER_HOST", ""),
            "indexer_port": safe_int(os.getenv("WAZUH_INDEXER_PORT"), 9200),
            "indexer_user": os.getenv("WAZUH_INDEXER_USERNAME", ""),
            "indexer_pass": os.getenv("WAZUH_INDEXER_PASSWORD", "")
        },
        "falcon": {
            "client_id": os.getenv("FALCON_CLIENT_ID", ""),
            "client_secret": os.getenv("FALCON_CLIENT_SECRET", ""),
            "base_url": os.getenv("FALCON_BASE_URL", "https://api.crowdstrike.com")
        },
        "velociraptor": {
            "api_config_path": os.getenv("VELOCIRAPTOR_API_CONFIG", "/config/api_client.yaml")
        },
        "llm_provider": os.getenv("LLM_PROVIDER", "openai"),
        "llm_configs": {
            "openai": {"apiKey": os.getenv("OPENAI_API_KEY", ""), "model": "gpt-4o"},
            "anthropic": {"apiKey": os.getenv("ANTHROPIC_API_KEY", ""), "model": "claude-3-5-sonnet-20240620"},
            "google": {"apiKey": os.getenv("GOOGLE_GENERATIVE_AI_API_KEY", ""), "model": "gemini-1.5-flash"},
            "ollama": {"apiKey": "local", "model": os.getenv("OLLAMA_MODEL", "qwen2.5-coder")}
        }
    }

    try:
        result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
        config = result.scalar_one_or_none()
        
        def safe_json(s):
            try: return json.loads(s) if s else {}
            except: return {}

        if not config:
            return {
                "onboarded": True,
                "config": {
                    "llmProvider": env_hints["llm_provider"],
                    "llmModel": env_hints["llm_configs"][env_hints["llm_provider"]]["model"],
                    "llmConfigs": env_hints["llm_configs"],
                    "assets": [],
                    "mcpConfig": {"wazuh": env_hints["wazuh"], "falcon": env_hints["falcon"]},
                    "keystore": []
                },
                "env_hints": env_hints
            }

        return {
            "onboarded": True,
            "config": {
                "llmProvider": getattr(config, 'llm_provider', "openai"),
                "llmModel": getattr(config, 'llm_model', "gpt-5-mini"),
                "llmConfigs": safe_json(getattr(config, 'llm_configs', '{}')),
                "assets": safe_json(getattr(config, 'assets', '[]')),
                "mcpConfig": safe_json(getattr(config, 'mcp_config', '{}')),
                "keystore": safe_json(getattr(config, 'keystore', '[]'))
            },
            "env_hints": env_hints
        }
    except Exception as e:
        print(f"Database error in check_onboarding: {e}")
        return {
            "onboarded": True,
            "config": None,
            "env_hints": env_hints,
            "error": str(e)
        }


@app.post("/api/onboarding/setup")
async def onboarding_setup(request: OnboardingSetupRequest, db: AsyncSession = Depends(get_db)):
    """Save full configuration from the Settings page."""
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
    config = result.scalar_one_or_none()

    mcp_config = json.dumps({
        "wazuh": {**request.wazuhConfig, "enabled": request.wazuhEnabled},
        "falcon": {**request.falconConfig, "enabled": request.falconEnabled},
        "velociraptor": {**(request.velociraptorConfig or {}), "enabled": request.velociraptorEnabled},
        "tavily": {**(request.tavilyConfig or {}), "enabled": request.tavilyEnabled}
    })

    # Preserve ollama config (not editable in settings page UI)
    existing_llm_configs = {}
    if config and config.llm_configs:
        try:
            existing_llm_configs = json.loads(config.llm_configs)
        except Exception:
            pass

    merged_llm_configs = dict(request.llmConfigs)
    if "ollama" not in merged_llm_configs and "ollama" in existing_llm_configs:
        merged_llm_configs["ollama"] = existing_llm_configs["ollama"]

    if config:
        config.llm_provider = request.llmProvider
        config.llm_model = request.llmModel
        config.llm_configs = json.dumps(merged_llm_configs)
        config.assets = json.dumps(request.assets)
        config.keystore = json.dumps(request.keystore)
        config.mcp_config = mcp_config
        config.onboarded = True
    else:
        config = SystemConfig(
            key="main",
            llm_provider=request.llmProvider,
            llm_model=request.llmModel,
            llm_configs=json.dumps(merged_llm_configs),
            assets=json.dumps(request.assets),
            keystore=json.dumps(request.keystore),
            mcp_config=mcp_config,
            onboarded=True
        )
        db.add(config)

    await db.commit()

    # Apply configuration to MCP servers in real-time
    try:
        from mcp_dispatcher import dispatcher
        if request.falconConfig and request.falconConfig.get("client_id"):
            print(f"[Core] Triggering real-time reconfiguration for Falcon MCP...")
            await dispatcher.execute("falcon_reconfigure", {
                "client_id": request.falconConfig["client_id"],
                "client_secret": request.falconConfig["client_secret"],
                "base_url": request.falconConfig.get("base_url")
            })
    except Exception as mcp_err:
        print(f"[Core] Error notifying MCP servers of config change: {mcp_err}")

    # Invalidate providers cache so next request reflects new API keys
    global _providers_cache
    _providers_cache = {"data": None, "expiry": None}
    return {"status": "saved"}


@app.post("/api/config/update")
async def update_config(request: ConfigUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    config.llm_provider = request.provider
    config.llm_model = request.model
    await db.commit()
    return {"status": "success"}

@app.post("/api/jobs/audit")
async def start_audit(request: JobRequest):
    job = job_queue.enqueue(run_security_audit, request.targetId)
    return {"job_id": job.get_id(), "status": "queued"}

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = job_queue.fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "status": job.get_status(),
        "result": job.result
    }

@app.get("/api/agents")
async def list_agents():
    try:
        raw_res = await dispatcher.execute("get_wazuh_agents", {"status": "active"})
        # MCP Response: {"jsonrpc": "2.0", "result": {"content": [{"type": "text", "text": "Wazuh Agents:\n{...}"}]}}
        if "result" in raw_res and "content" in raw_res["result"]:
            text_content = raw_res["result"]["content"][0].get("text", "")
            if "Wazuh Agents:" in text_content:
                json_str = text_content.replace("Wazuh Agents:", "").strip()
                data = json.loads(json_str)
                # Wazuh response structure: {"data": {"affected_items": [...]}}
                return data.get("data", {})
        return {"affected_items": []}
    except Exception as e:
        print(f"Error fetching agents: {e}")
        return {"error": str(e), "affected_items": []}



class RunCommandRequest(BaseModel):
    target: str
    command: str

@app.post("/api/run-command")
async def run_command_api(request: RunCommandRequest):
    try:
        from mcp_dispatcher import dispatcher
        result = await dispatcher.execute("execute_host_command", {"target": request.target, "command": request.command})
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    async def event_generator():
        try:
            async for chunk in builder_reasoning(request.message, request.provider, request.model, request.mode, request.messages):
                yield f"{chunk}"
        except Exception as e:
            yield f"Error: {str(e)}"

    return StreamingResponse(event_generator(), media_type="text/plain")

@app.websocket("/ws/terminal/{ip}")
async def terminal_websocket(websocket: WebSocket, ip: str, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    
    # Get asset credentials
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
    config = result.scalar_one_or_none()
    if not config:
        await websocket.close(code=1008)
        return
    
    assets = json.loads(config.assets)
    # Be more flexible with IP matching (strip whitespace)
    asset = next((a for a in assets if a.get("ip", "").strip() == ip.strip()), None)
    
    print(f"[Terminal] Connecting to {ip}. Asset found: {asset is not None}")
    if asset:
        print(f"[Terminal] Auth Mode: {asset.get('auth_mode')}, Key ID: {asset.get('key_id')}")

    if not asset:
        await websocket.close(code=1008)
        return
    
    try:
        import io
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        port = int(asset.get("port", 22))
        auth_mode = asset.get("auth_mode", "password")
        
        connect_kwargs = {
            "hostname": asset["ip"],
            "port": port,
            "username": asset["user"],
            "timeout": 15, # Increased timeout
            "allow_agent": False,
            "look_for_keys": False
        }

        if auth_mode == "key" and asset.get("key_id"):
            print(f"[Terminal] Attempting Key auth with Key ID: {asset.get('key_id')}")
            try:
                keystore_raw = getattr(config, "keystore", "[]")
                keystore = json.loads(keystore_raw)
                key_entry = next((k for k in keystore if k.get("id") == asset["key_id"]), None)
                if key_entry and key_entry.get("private_key"):
                    print(f"[Terminal] Key '{key_entry.get('name')}' found in keystore")
                    pkey_file = io.StringIO(key_entry["private_key"])
                    pkey = None
                    # Try various key types
                    errors = []
                    for key_type in ["RSAKey", "Ed25519Key", "ECDSAKey", "DSSKey"]:
                        if not hasattr(paramiko, key_type):
                            continue
                        key_class = getattr(paramiko, key_type)
                        try:
                            pkey_file.seek(0)
                            pkey = key_class.from_private_key(pkey_file)
                            if pkey: 
                                print(f"[Terminal] Successfully loaded key using {key_type}")
                                break
                        except Exception as e:
                            errors.append(f"{key_type}: {str(e)}")
                    
                    if pkey:
                        connect_kwargs["pkey"] = pkey
                    else:
                        error_msg = f"Failed to parse private key as any supported type. Errors: {'; '.join(errors)}"
                        print(f"[Terminal] {error_msg}")
                        await websocket.send_text(f"\r\n\x1b[1;31m[Error] {error_msg}\x1b[0m\r\n")
                        await websocket.close()
                        return
                else:
                    print(f"[Terminal] Key ID {asset['key_id']} NOT found in keystore or missing private_key")
                    await websocket.send_text(f"\r\n\x1b[1;31m[Error] SSH key not found in keystore\x1b[0m\r\n")
                    await websocket.close()
                    return
            except Exception as e:
                print(f"[Terminal] Exception during key loading: {traceback.format_exc()}")
                await websocket.send_text(f"\r\n\x1b[1;31m[Error] Key loading failed: {str(e)}\x1b[0m\r\n")
                await websocket.close()
                return
        else:
            print(f"[Terminal] Using Password auth")
            connect_kwargs["password"] = asset.get("pass")

        print(f"[Terminal] Calling ssh.connect for {asset['ip']} as {asset['user']}...")
        await asyncio.to_thread(ssh.connect, **connect_kwargs)
        print(f"[Terminal] SSH Connected successfully")
        
        # Initial size (will be updated by frontend)
        # invoke_shell is also blocking, run in thread
        channel = await asyncio.to_thread(ssh.invoke_shell, term='xterm-256color', width=80, height=24)
        channel.setblocking(False)
        
        async def ssh_to_ws():
            try:
                while True:
                    if channel.recv_ready():
                        data = channel.recv(4096).decode('utf-8', errors='replace')
                        await websocket.send_text(data)
                    else:
                        await asyncio.sleep(0.02)
            except Exception:
                pass
                
        async def ws_to_ssh():
            try:
                while True:
                    msg_text = await websocket.receive_text()
                    try:
                        msg = json.loads(msg_text)
                        if msg["type"] == "data":
                            channel.send(msg["data"])
                        elif msg["type"] == "resize":
                            channel.resize_pty(width=msg["cols"], height=msg["rows"])
                    except json.JSONDecodeError:
                        # Fallback for old clients sending raw data
                        channel.send(msg_text)
            except (WebSocketDisconnect, Exception):
                pass
        
        await asyncio.gather(ssh_to_ws(), ws_to_ssh())
        
    except Exception as e:
        await websocket.send_text(f"\r\n\x1b[1;31m[Error] Connection failed: {str(e)}\x1b[0m\r\n")
        try:
            await websocket.close()
        except:
            pass
    finally:
        if 'ssh' in locals():
            ssh.close()

# ── Playbook CRUD ─────────────────────────────────────────────────────────────

@app.get("/api/playbooks")
async def list_playbooks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).order_by(Playbook.updated_at.desc()))
    playbooks = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "block_count": len(json.loads(p.blocks or "[]")),
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in playbooks
    ]

@app.post("/api/playbooks")
async def create_playbook(body: PlaybookSaveRequest, db: AsyncSession = Depends(get_db)):
    p = Playbook(name=body.name.strip(), blocks=json.dumps(body.blocks))
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {"id": p.id, "name": p.name, "created_at": p.created_at.isoformat()}

@app.get("/api/playbooks/{playbook_id}")
async def get_playbook(playbook_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return {
        "id": p.id,
        "name": p.name,
        "blocks": json.loads(p.blocks or "[]"),
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }

@app.patch("/api/playbooks/{playbook_id}")
async def update_playbook(playbook_id: int, body: PlaybookSaveRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Playbook not found")
    p.name = body.name.strip()
    p.blocks = json.dumps(body.blocks)
    p.updated_at = datetime.utcnow()
    await db.commit()
    return {"id": p.id, "name": p.name, "updated_at": p.updated_at.isoformat()}

@app.delete("/api/playbooks/{playbook_id}")
async def delete_playbook(playbook_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Playbook not found")
    await db.delete(p)
    await db.commit()
    return {"ok": True}

@app.post("/api/audit/verify-path")
async def audit_verify_path(body: AuditVerifyPathRequest):
    """Checks if a file exists and is readable on the target host."""
    try:
        safe_path = shlex.quote(body.file_path)
        # Check if it's a regular file and readable
        cmd = f"[ -f {safe_path} ] && [ -r {safe_path} ] && echo 'EXISTS' || echo 'NOT_FOUND'"
        result = await dispatcher.execute("execute_host_command", {
            "target": body.ip,
            "command": cmd,
        })
        stdout = str(result.get("stdout", "")).strip()
        if "EXISTS" in stdout:
            return {"exists": True}
        
        # If explicitly not found, check why
        err = str(result.get("stderr", "")).strip()
        return {"exists": False, "error": err or "파일이 존재하지 않거나 읽기 권한이 없습니다."}
    except Exception as e:
        return {"exists": False, "error": str(e)}

# ── Audit SSH chunk read ───────────────────────────────────────────────────────

@app.post("/api/audit/ssh-read")
async def audit_ssh_read(body: AuditSSHReadRequest):
    """
    Read a line range of a remote file via SSH using the MCP dispatcher.
    On the first chunk (start_line == 1), also returns total_lines via wc -l.
    """
    try:
        safe_path = shlex.quote(body.file_path)
        total_lines: int | None = None

        if body.start_line == 1:
            wc_result = await dispatcher.execute("execute_host_command", {
                "target": body.ip,
                "command": f"wc -l < {safe_path} 2>/dev/null",
            })
            try:
                total_lines = int(str(wc_result.get("stdout", "")).strip())
            except Exception:
                total_lines = None

        read_result = await dispatcher.execute("execute_host_command", {
            "target": body.ip,
            "command": f"sed -n '{body.start_line},{body.end_line}p' {safe_path}",
        })
        text = str(read_result.get("stdout", ""))
        err  = str(read_result.get("stderr", "")) or None

        return {
            "text": text,
            "total_lines": total_lines,
            "start_line": body.start_line,
            "end_line": body.end_line,
            "error": err,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
@app.get("/api/dashboard/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregates real-time security metrics for the dashboard."""
    
    # 1. Fetch Assets & Integration Config
    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
    config = result.scalar_one_or_none()
    
    assets = []
    mcp_config = {}
    if config:
        try: assets = json.loads(config.assets or "[]")
        except: pass
        try: mcp_config = json.loads(config.mcp_config or "{}")
        except: pass
    
    # 2. Monitoring Task Status Summary (Latest per task)
    # Get latest result for each task
    from sqlalchemy import func
    subq = select(
        MonitoringResult.task_id, 
        func.max(MonitoringResult.timestamp).label("max_ts")
    ).group_by(MonitoringResult.task_id).subquery()
    
    latest_results_query = select(MonitoringResult).join(
        subq, (MonitoringResult.task_id == subq.c.task_id) & (MonitoringResult.timestamp == subq.c.max_ts)
    )
    
    res_latest = await db.execute(latest_results_query)
    latest_results = res_latest.scalars().all()
    
    stats_summary = {"green": 0, "amber": 0, "red": 0, "error": 0}
    for r in latest_results:
        s = r.status.lower()
        if s in stats_summary: stats_summary[s] += 1
        else: stats_summary["amber"] += 1

    # 3. Recent Alerts (Red status results)
    alerts_query = select(MonitoringResult, MonitoringTask.title).join(
        MonitoringTask, MonitoringResult.task_id == MonitoringTask.id
    ).filter(MonitoringResult.status == "red").order_by(MonitoringResult.timestamp.desc()).limit(10)
    
    res_alerts = await db.execute(alerts_query)
    alerts_data = []
    for r, title in res_alerts:
        try:
            detail = json.loads(r.result_data)
            msg = detail.get("threshold_eval", {}).get("error") or detail.get("error") or "보안 임계치 도달"
        except:
            msg = "Alert detected"
            
        alerts_data.append({
            "id": r.id,
            "task_title": title,
            "timestamp": r.timestamp.isoformat() + "Z",
            "message": msg
        })

    # 4. Integration Status Check
    def is_configured(svc):
        conf = mcp_config.get(svc, {})
        if svc == "wazuh": return bool(conf.get("host") and conf.get("user"))
        if svc == "falcon": return bool(conf.get("client_id") and conf.get("client_secret"))
        if svc == "velociraptor": return bool(conf.get("api_config_path"))
        return False

    return {
        "status": "active",
        "asset_count": len(assets),
        "monitoring": {
            "total_tasks": len(latest_results),
            "summary": stats_summary
        },
        "alerts": alerts_data,
        "integrations": {
            "wazuh": "online" if is_configured("wazuh") else "not_configured",
            "falcon": "online" if is_configured("falcon") else "not_configured",
            "velociraptor": "online" if is_configured("velociraptor") else "not_configured"
        }
    }

# ── Bug Report ───────────────────────────────────────────────────────────────
class BugReportRequest(BaseModel):
    screenshot: str          # data:image/png;base64,... or empty string
    category: str
    severity: str
    page: str
    description: str
    steps: Optional[str] = ""

@app.post("/api/report-bug")
async def report_bug(request: BugReportRequest):
    import smtplib
    import base64
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders as email_encoders

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    report_dir = "/app/reports" if os.path.exists("/app") else "reports"
    os.makedirs(report_dir, exist_ok=True)

    # Decode screenshot
    screenshot_bytes = b""
    if request.screenshot:
        try:
            raw = request.screenshot.split(",", 1)[1] if "," in request.screenshot else request.screenshot
            screenshot_bytes = base64.b64decode(raw)
            with open(f"{report_dir}/bug_{timestamp}.png", "wb") as f:
                f.write(screenshot_bytes)
        except Exception:
            pass

    # Save JSON report
    report_meta = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "category": request.category,
        "severity": request.severity,
        "page": request.page,
        "description": request.description,
        "steps": request.steps,
    }
    with open(f"{report_dir}/bug_{timestamp}.json", "w", encoding="utf-8") as f:
        json.dump(report_meta, f, indent=2, ensure_ascii=False)

    # Try SMTP
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    report_to = os.getenv("REPORT_TO_EMAIL")

    email_sent = False
    if smtp_host and smtp_user and report_to:
        try:
            msg = MIMEMultipart("related")
            msg["Subject"] = f"[Prism Bug] {request.category} | {request.severity.upper()} | {request.page}"
            msg["From"] = smtp_user
            msg["To"] = report_to

            sev_color = {"critical": "#ef4444", "high": "#f97316", "medium": "#f59e0b", "low": "#3b82f6"}.get(request.severity, "#94a3b8")
            steps_html = f"<h3 style='color:#94a3b8;margin-top:20px'>재현 단계</h3><pre style='white-space:pre-wrap;color:#cbd5e1'>{request.steps}</pre>" if request.steps else ""
            img_tag = '<img src="cid:screenshot" style="max-width:800px;border:1px solid #334155;border-radius:8px;margin-top:12px">' if screenshot_bytes else ""

            html_body = f"""<html><body style="font-family:system-ui,sans-serif;background:#0a0c12;color:#e2e8f0;padding:24px;max-width:900px">
<h2 style="color:#22d3ee;margin:0 0 20px">🛡 Prism AI Defender — Bug Report</h2>
<table style="border-collapse:collapse;width:100%;margin-bottom:20px">
  <tr><td style="padding:8px 12px;color:#64748b;width:130px;font-size:12px">Timestamp</td><td style="padding:8px 12px;font-size:13px">{datetime.utcnow().isoformat()}Z</td></tr>
  <tr><td style="padding:8px 12px;color:#64748b;font-size:12px">Category</td><td style="padding:8px 12px;font-size:13px">{request.category}</td></tr>
  <tr><td style="padding:8px 12px;color:#64748b;font-size:12px">Severity</td><td style="padding:8px 12px"><span style="background:{sev_color}22;color:{sev_color};padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase">{request.severity}</span></td></tr>
  <tr><td style="padding:8px 12px;color:#64748b;font-size:12px">Page</td><td style="padding:8px 12px;font-size:13px;font-family:monospace">{request.page}</td></tr>
</table>
<h3 style="color:#94a3b8;margin-bottom:8px">증상 설명</h3>
<pre style="white-space:pre-wrap;color:#cbd5e1;background:#1e293b;padding:16px;border-radius:8px;font-size:13px">{request.description}</pre>
{steps_html}
<h3 style="color:#94a3b8;margin-top:20px;margin-bottom:8px">화면 캡처</h3>
{img_tag}
</body></html>"""

            msg.attach(MIMEText(html_body, "html"))

            if screenshot_bytes:
                img_part = MIMEBase("image", "png")
                img_part.set_payload(screenshot_bytes)
                email_encoders.encode_base64(img_part)
                img_part.add_header("Content-ID", "<screenshot>")
                img_part.add_header("Content-Disposition", "inline", filename=f"screenshot_{timestamp}.png")
                msg.attach(img_part)

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            email_sent = True
        except Exception as e:
            print(f"[Bug Report] SMTP failed: {e}")

    msg_text = "제보가 전송되었습니다." if email_sent else "제보가 서버에 저장되었습니다. (이메일 발송을 원하면 .env에 SMTP 설정을 추가하세요.)"
    return {"success": True, "email_sent": email_sent, "message": msg_text}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
