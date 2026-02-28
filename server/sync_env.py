import asyncio
import os
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://prism:prism_pass@db:5432/prism_db")
# If running outside docker, replace 'db' with 'localhost'
if os.getenv("RUNNING_LOCALLY"):
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def _load_assets_json() -> list:
    """Load assets from assets.json if it exists, otherwise return empty list."""
    for path in ["/app/assets.json", "assets.json"]:
        try:
            with open(path) as f:
                data = json.load(f)
                if isinstance(data, list) and data:
                    print(f"[sync] Loaded {len(data)} assets from {path}")
                    return data
        except Exception:
            pass
    return []

async def sync():
    print(f"Syncing env to DB: {DATABASE_URL}")
    async with SessionLocal() as db:
        async with engine.begin() as conn:
            # Get current config or create
            res = await conn.execute(text("SELECT * FROM system_configs WHERE key = 'main'"))
            config = res.fetchone()

            # Env-sourced defaults (used only when DB value is empty)
            env_llm_configs = {
                "openai": {"apiKey": os.getenv("OPENAI_API_KEY", ""), "model": "gpt-5-mini"},
                "anthropic": {"apiKey": os.getenv("ANTHROPIC_API_KEY", ""), "model": "claude-sonnet-4-6"},
                "google": {"apiKey": os.getenv("GOOGLE_GENERATIVE_AI_API_KEY", ""), "model": "gemini-2.5-flash"},
                "ollama": {"apiKey": "local", "model": os.getenv("OLLAMA_MODEL", "qwen3-coder-next:q8_0")}
            }

            mcp_config = {
                "wazuh": {
                    "host": os.getenv("WAZUH_API_HOST", "localhost"),
                    "port": int(os.getenv("WAZUH_API_PORT", "55000")),
                    "user": os.getenv("WAZUH_API_USERNAME", "wazuh"),
                    "pass": os.getenv("WAZUH_API_PASSWORD", "wazuh"),
                    "indexer_host": os.getenv("WAZUH_INDEXER_HOST", ""),
                    "indexer_port": int(os.getenv("WAZUH_INDEXER_PORT", "9200")),
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
                "tavily": {
                    "api_key": os.getenv("TAVILY_API_KEY", "")
                }
            }

            llm_provider = os.getenv("LLM_PROVIDER", "openai")
            llm_model = os.getenv("OLLAMA_MODEL", "qwen3-coder-next:q8_0") if llm_provider == "ollama" else env_llm_configs.get(llm_provider, {}).get("model", "gpt-5-mini")

            file_assets = _load_assets_json()

            if not config:
                # First run: seed everything from env vars + assets.json
                await conn.execute(text("""
                    INSERT INTO system_configs (key, control_mode, llm_provider, llm_model, llm_configs, mcp_config, onboarded, assets, keystore)
                    VALUES ('main', 'ADVISOR', :provider, :model, :configs, :mcp, true, :assets, '[]')
                """), {
                    "provider": llm_provider,
                    "model": llm_model,
                    "configs": json.dumps(env_llm_configs),
                    "mcp": json.dumps(mcp_config),
                    "assets": json.dumps(file_assets)
                })
                print(f"Created initial config from env vars (assets: {len(file_assets)} from assets.json).")
            else:
                # Subsequent starts: ONLY fill in empty/missing values from env — never overwrite user-set values
                def fill_empty(existing_dict, env_defaults):
                    """Fill missing or empty fields from env defaults. Preserves non-empty user values."""
                    result = {}
                    all_keys = set(existing_dict.keys()) | set(env_defaults.keys())
                    for k in all_keys:
                        ex_val = existing_dict.get(k)
                        env_val = env_defaults.get(k)
                        # Use existing value if non-empty/non-null/non-zero
                        if ex_val is not None and ex_val != "" and ex_val != 0:
                            result[k] = ex_val
                        else:
                            result[k] = env_val
                    return result

                # Merge llm_configs
                try:
                    existing_llm = json.loads(config.llm_configs) if config.llm_configs else {}
                except Exception:
                    existing_llm = {}

                merged_llm = {}
                for provider, env_vals in env_llm_configs.items():
                    ex = existing_llm.get(provider, {})
                    merged_llm[provider] = {
                        "apiKey": ex.get("apiKey") or env_vals.get("apiKey", ""),
                        "model": ex.get("model") or env_vals.get("model", "")
                    }

                # Merge mcp_config (fills missing indexer/falcon fields added in later schema versions)
                try:
                    existing_mcp = json.loads(config.mcp_config) if config.mcp_config else {}
                except Exception:
                    existing_mcp = {}

                merged_wazuh = fill_empty(existing_mcp.get("wazuh", {}), mcp_config["wazuh"])
                merged_falcon = fill_empty(existing_mcp.get("falcon", {}), mcp_config["falcon"])
                merged_velociraptor = fill_empty(existing_mcp.get("velociraptor", {}), mcp_config["velociraptor"])
                merged_tavily = fill_empty(existing_mcp.get("tavily", {}), mcp_config["tavily"])

                # If assets in DB is empty and assets.json has entries, load from file
                try:
                    existing_assets = json.loads(config.assets) if config.assets else []
                except Exception:
                    existing_assets = []

                # Migration for existing assets: Add default category/sector if missing
                migrated = False
                for asset in existing_assets:
                    if "category" not in asset:
                        asset["category"] = "defense" if "linux-vm" in asset.get("name", "").lower() else "security"
                        migrated = True
                    if "sector" not in asset:
                        asset["sector"] = "BEG" if asset.get("category") == "defense" else ""
                        migrated = True
                
                if migrated:
                    print(f"[sync] Migrated {len(existing_assets)} existing assets with new fields.")

                merged_assets = existing_assets if (existing_assets and not migrated) else (existing_assets or file_assets)
                if not existing_assets and file_assets:
                    print(f"[sync] Assets was empty — loaded {len(file_assets)} assets from assets.json")

                await conn.execute(text(
                    "UPDATE system_configs SET llm_configs = :configs, mcp_config = :mcp, assets = :assets WHERE key = 'main'"
                ), {
                    "configs": json.dumps(merged_llm),
                    "mcp": json.dumps({"wazuh": merged_wazuh, "falcon": merged_falcon, "velociraptor": merged_velociraptor, "tavily": merged_tavily}),
                    "assets": json.dumps(merged_assets)
                })
                print("Merged env values into existing config (user-set values preserved).")

            await conn.commit()
    print("Sync complete.")

if __name__ == "__main__":
    asyncio.run(sync())
