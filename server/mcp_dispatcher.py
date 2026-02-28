import httpx
import json
import asyncio
import os
from sqlalchemy import select
import traceback

class RemoteMCPClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
        self._session_id: str | None = None

        # FastMCP auto-enables DNS rebinding protection when host="127.0.0.1" (its default).
        # allowed_hosts = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
        # The ":*" wildcard requires a port, so we must send "localhost:<port>".
        from urllib.parse import urlparse
        parsed = urlparse(base_url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self._host_header = f"localhost:{port}"

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Host": self._host_header,
        }
        if self._session_id:
            h["Mcp-Session-Id"] = self._session_id
        if extra:
            h.update(extra)
        return h

    def _parse_response(self, response: httpx.Response) -> dict:
        """Handle both plain JSON and SSE (text/event-stream) MCP responses."""
        content_type = response.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            for line in response.text.splitlines():
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str and data_str != "[DONE]":
                        try:
                            return json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
            return {"result": {"tools": []}}
        return response.json()

    async def _ensure_session(self):
        """Run MCP initialize handshake to obtain a session ID (required by streamable-http transport)."""
        if self._session_id:
            return
        init_payload = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "prism-dispatcher", "version": "1.0"},
            },
            "id": 0,
        }
        try:
            resp = await self.client.post(self.base_url, json=init_payload, headers=self._headers())
            self._session_id = resp.headers.get("Mcp-Session-Id")
            # Send initialized notification (fire-and-forget, no response expected)
            if self._session_id:
                notif = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
                await self.client.post(self.base_url, json=notif, headers=self._headers())
            print(f"[RemoteMCPClient] Session ready for {self.base_url}: {self._session_id}")
        except Exception as e:
            print(f"[RemoteMCPClient] Session init failed for {self.base_url}: {e}")

    async def call_tool(self, tool_name: str, arguments: dict):
        await self._ensure_session()
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
            "id": 1,
        }
        response = await self.client.post(self.base_url, json=payload, headers=self._headers())
        response.raise_for_status()
        return self._parse_response(response)

    async def list_tools(self):
        await self._ensure_session()
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "params": {},
            "id": 1,
        }
        try:
            response = await self.client.post(self.base_url, json=payload, headers=self._headers())
            response.raise_for_status()
            return self._parse_response(response)
        except Exception as e:
            self._session_id = None  # reset so next call retries the handshake
            print(f"[RemoteMCPClient] Error listing tools from {self.base_url}: {e}")
            return {"result": {"tools": []}}

    async def close(self):
        await self.client.aclose()

class ToolDispatcher:
    def __init__(self):
        self.clients = {}

    def register_client(self, name: str, url: str):
        self.clients[name] = RemoteMCPClient(url)

    async def execute(self, tool_name: str, tool_args: dict):
        # Internal Tools
        if tool_name == "deploy_monitoring_task":
            from models import MonitoringTask, SessionLocal
            async with SessionLocal() as db:
                task = MonitoringTask(
                    title=tool_args.get("title", "New Task"),
                    tool_name=tool_args.get("tool_name"),
                    tool_args=json.dumps(tool_args.get("tool_args", {})),
                    threshold_condition=tool_args.get("threshold_condition"),
                    interval_minutes=int(tool_args.get("interval_minutes", 5)),
                    target_agent=tool_args.get("target_agent", "all")
                )
                db.add(task)
                await db.commit()
                return {"status": "success", "task_id": task.id, "message": f"Monitoring task '{task.title}' deployed successfully."}

        if tool_name == "execute_host_command":
            from models import SystemConfig, SessionLocal
            import paramiko
            target = tool_args.get("target")
            command = tool_args.get("command")
            if not target or not command:
                return {"status": "error", "message": "Missing target or command"}
            
            try:
                async with SessionLocal() as db:
                    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
                    config = result.scalar_one_or_none()
                    if not config:
                        return {"status": "error", "message": "No system config found in DB"}
                    if not config.assets:
                        return {"status": "error", "message": "assets field is empty in config"}
                    
                    assets = json.loads(config.assets)
                    print(f"[execute_host_command] assets: {assets}")
                    print(f"[execute_host_command] looking for target: {target}")
                    target_asset = next((a for a in assets if a.get("ip") == target or a.get("name") == target), None)
                    if not target_asset:
                        return {"status": "error", "message": f"Asset '{target}' not found. Available: {[a.get('name') or a.get('ip') for a in assets]}"}

                    async def run_ssh():
                        import paramiko
                        import io
                        ssh = paramiko.SSHClient()
                        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        port = int(target_asset.get("port", 22))
                        auth_mode = target_asset.get("auth_mode", "password")
                        asset_os = target_asset.get("os", "linux").lower()
                        try:
                            connect_kwargs = {
                                "hostname": target_asset["ip"],
                                "port": port,
                                "username": target_asset["user"],
                                "timeout": 10,
                                "allow_agent": False,
                                "look_for_keys": False
                            }
                            
                            if auth_mode == "key" and target_asset.get("key_id"):
                                print(f"[Dispatcher] SSH Key mode for {target_asset['ip']} with Key ID: {target_asset['key_id']}")
                                try:
                                    keystore_raw = getattr(config, "keystore", "[]")
                                    keystore = json.loads(keystore_raw)
                                    key_entry = next((k for k in keystore if k.get("id") == target_asset["key_id"]), None)
                                    if key_entry and key_entry.get("private_key"):
                                        print(f"[Dispatcher] Found key '{key_entry.get('name')}' in keystore")
                                        pkey_file = io.StringIO(key_entry["private_key"])
                                        pkey = None
                                        errors = []
                                        for key_type in ["RSAKey", "Ed25519Key", "ECDSAKey", "DSSKey"]:
                                            if not hasattr(paramiko, key_type):
                                                continue
                                            key_class = getattr(paramiko, key_type)
                                            try:
                                                pkey_file.seek(0)
                                                pkey = key_class.from_private_key(pkey_file)
                                                if pkey: 
                                                    print(f"[Dispatcher] Successfully loaded key using {key_type}")
                                                    break
                                            except Exception as e:
                                                errors.append(f"{key_type}: {str(e)}")
                                        
                                        if pkey:
                                            connect_kwargs["pkey"] = pkey
                                        else:
                                            error_msg = f"Failed to parse SSH key. Errors: {'; '.join(errors)}"
                                            print(f"[Dispatcher] {error_msg}")
                                            return {"status": "error", "message": error_msg}
                                    else:
                                        print(f"[Dispatcher] SSH key ID '{target_asset['key_id']}' NOT found or missing privkey")
                                        return {"status": "error", "message": f"SSH key with ID '{target_asset['key_id']}' not found in keystore"}
                                except Exception as key_err:
                                    import traceback
                                    print(f"[Dispatcher] Key loading exception: {traceback.format_exc()}")
                                    return {"status": "error", "message": f"Error loading SSH key: {str(key_err)}"}
                            else:
                                print(f"[Dispatcher] SSH Password mode for {target_asset['ip']}")
                                connect_kwargs["password"] = target_asset.get("pass")

                            print(f"[Dispatcher] Connecting to {target_asset['ip']}...")
                            await asyncio.to_thread(ssh.connect, **connect_kwargs)
                            print(f"[Dispatcher] SSH Connected successfully")

                            # exec_command is also blocking
                            def exec_sync():
                                cmd = command
                                pswd = target_asset.get("pass")
                                username = target_asset.get("user")

                                # Windows: execute directly without sudo wrapping
                                if asset_os == "windows":
                                    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
                                    out_data = stdout.read().decode('utf-8', errors='replace')
                                    err_data = stderr.read().decode('utf-8', errors='replace')
                                    return out_data, err_data

                                def run_raw(c, is_sudo=False):
                                    target_cmd = c
                                    # If root, ensure no sudo
                                    if username == "root":
                                        target_cmd = target_cmd.replace("sudo -S ", "").replace("sudo ", "")
                                    elif is_sudo:
                                        if "sudo " in target_cmd and "sudo -S" not in target_cmd:
                                            target_cmd = target_cmd.replace("sudo ", "sudo -S ", 1)
                                        elif not target_cmd.startswith("sudo"):
                                            target_cmd = f"sudo -S {target_cmd}"
                                    
                                    stdin, stdout, stderr = ssh.exec_command(target_cmd, timeout=30)
                                    if "sudo -S" in target_cmd and pswd:
                                        stdin.write(pswd + "\n")
                                        stdin.flush()
                                    
                                    out_data = stdout.read().decode('utf-8', errors='replace')
                                    err_data = stderr.read().decode('utf-8', errors='replace')
                                    status_code = stdout.channel.recv_exit_status()
                                    return out_data, err_data, status_code

                                if username == "root" or "sudo" not in cmd:
                                    out_res, err_res, _ = run_raw(cmd, is_sudo=False)
                                    return out_res, err_res
                                else:
                                    # Sudo requested and not root
                                    out_res, err_res, status = run_raw(cmd, is_sudo=True)
                                    if status != 0:
                                        # Fallback if sudo failed
                                        print(f"[Dispatcher] Sudo failed (status {status}), falling back to non-sudo")
                                        clean_cmd = cmd.replace("sudo ", "", 1)
                                        out_retry, err_retry, _ = run_raw(clean_cmd, is_sudo=False)
                                        return out_retry, err_retry
                                    return out_res, err_res
                                
                            out, err = await asyncio.to_thread(exec_sync)
                            return {
                                "status": "success",
                                "target": target_asset["ip"],
                                "command": command,
                                "stdout": out,
                                "stderr": err
                            }
                        except Exception as e:
                            return {"status": "error", "message": f"SSH error: {str(e)}"}
                        finally:
                            ssh.close()
                    
                    return await run_ssh()
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {"status": "error", "message": f"execute_host_command failed: {str(e)}"}

        if tool_name == "search_web":
            query = tool_args.get("query")
            if not query:
                return {"status": "error", "message": "Missing query"}

            tavily_key = os.environ.get("TAVILY_API_KEY") or os.environ.get("SEARCH_API_KEY")
            # Also check DB-stored config as fallback
            if not tavily_key:
                try:
                    from config_svc import config_svc
                    cfg = await config_svc.get_config()
                    if cfg and cfg.mcp_config:
                        mcp = json.loads(cfg.mcp_config)
                        tavily_key = mcp.get("tavily", {}).get("api_key", "")
                except Exception:
                    pass

            if not tavily_key:
                return {
                    "status": "error", 
                    "message": "Web search is currently disabled. Please set TAVILY_API_KEY in .env to enable this capability."
                }
            
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": tavily_key,
                            "query": query,
                            "search_depth": "smart",
                            "include_answer": True,
                            "max_results": 5
                        },
                        timeout=15.0
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    
                    # Format results for the agent
                    results = data.get("results", [])
                    formatted = f"Search Results for: {query}\n\n"
                    if data.get("answer"):
                        formatted += f"Summary Answer: {data['answer']}\n\n"
                    
                    for i, r in enumerate(results):
                        formatted += f"[{i+1}] {r.get('title')}\nURL: {r.get('url')}\nContent: {r.get('content')}\n\n"
                    
                    return {"status": "success", "stdout": formatted}
            except Exception as e:
                return {"status": "error", "message": f"Search failed: {str(e)}"}

        if tool_name == "upload_file_to_host":
            import base64
            from io import BytesIO
            from models import SystemConfig, SessionLocal
            import paramiko
            target = tool_args.get("target")
            remote_path = tool_args.get("remote_path")
            content_b64 = tool_args.get("content_b64")
            if not target or not remote_path or not content_b64:
                return {"status": "error", "message": "Missing target, remote_path, or content_b64"}

            try:
                async with SessionLocal() as db:
                    result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
                    config = result.scalar_one_or_none()
                    if not config:
                        return {"status": "error", "message": "No system config found in DB"}
                    if not config.assets:
                        return {"status": "error", "message": "assets field is empty in config"}

                    assets = json.loads(config.assets)
                    target_asset = next((a for a in assets if a.get("ip") == target or a.get("name") == target), None)
                    if not target_asset:
                        return {"status": "error", "message": f"Asset '{target}' not found. Available: {[a.get('name') or a.get('ip') for a in assets]}"}

                    async def run_sftp():
                        import io
                        ssh = paramiko.SSHClient()
                        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                        port = int(target_asset.get("port", 22))
                        auth_mode = target_asset.get("auth_mode", "password")
                        try:
                            connect_kwargs = {
                                "hostname": target_asset["ip"],
                                "port": port,
                                "username": target_asset["user"],
                                "timeout": 10,
                                "allow_agent": False,
                                "look_for_keys": False
                            }

                            if auth_mode == "key" and target_asset.get("key_id"):
                                keystore_raw = getattr(config, "keystore", "[]")
                                keystore = json.loads(keystore_raw)
                                key_entry = next((k for k in keystore if k.get("id") == target_asset["key_id"]), None)
                                if key_entry and key_entry.get("private_key"):
                                    pkey_file = io.StringIO(key_entry["private_key"])
                                    pkey = None
                                    for key_type in ["RSAKey", "Ed25519Key", "ECDSAKey", "DSSKey"]:
                                        if not hasattr(paramiko, key_type):
                                            continue
                                        key_class = getattr(paramiko, key_type)
                                        try:
                                            pkey_file.seek(0)
                                            pkey = key_class.from_private_key(pkey_file)
                                            if pkey:
                                                break
                                        except Exception:
                                            pass
                                    if pkey:
                                        connect_kwargs["pkey"] = pkey
                                    else:
                                        return {"status": "error", "message": "Failed to parse SSH key for SFTP"}
                                else:
                                    return {"status": "error", "message": f"SSH key '{target_asset['key_id']}' not found"}
                            else:
                                connect_kwargs["password"] = target_asset.get("pass")

                            await asyncio.to_thread(ssh.connect, **connect_kwargs)

                            def sftp_put():
                                sftp = paramiko.SFTPClient.from_transport(ssh.get_transport())
                                try:
                                    file_bytes = base64.b64decode(content_b64)
                                    sftp.putfo(BytesIO(file_bytes), remote_path)
                                finally:
                                    sftp.close()

                            await asyncio.to_thread(sftp_put)
                            return {"status": "success", "target": target_asset["ip"], "path": remote_path}
                        except Exception as e:
                            return {"status": "error", "message": f"SFTP error: {str(e)}"}
                        finally:
                            ssh.close()

                    return await run_sftp()
            except Exception as e:
                traceback.print_exc()
                return {"status": "error", "message": f"upload_file_to_host failed: {str(e)}"}

        # Known Velociraptor tool names (from mcp_velociraptor_bridge.py)
        VELOCIRAPTOR_TOOLS = {
            'client_info', 'linux_pslist', 'linux_groups', 'linux_mounts',
            'linux_netstat_enriched', 'linux_users', 'windows_pslist',
            'windows_netstat_enriched', 'windows_scheduled_tasks', 'windows_services',
            'windows_recentdocs', 'windows_shellbags', 'windows_mounted_mass_storage_usb',
            'windows_evidence_of_download', 'windows_mountpoints2',
            'windows_execution_amcache', 'windows_execution_bam',
            'windows_execution_activitiesCache', 'windows_execution_userassist',
            'windows_execution_shimcache', 'windows_execution_prefetch',
            'windows_ntfs_mft', 'get_collection_results', 'collect_artifact',
            'collect_forensic_triage', 'list_windows_artifacts', 'list_linux_artifacts',
        }

        client_name = 'wazuh'
        if tool_name.startswith('falcon_'):
            client_name = 'falcon'
        elif tool_name in VELOCIRAPTOR_TOOLS:
            client_name = 'velociraptor'

        client = self.clients.get(client_name)
        if not client:
            # Automatic initialization for Docker environment
            url_map = {
                "wazuh": "http://mcp-wazuh:3000/mcp",
                "falcon": "http://mcp-falcon:9000/mcp",
                "velociraptor": "http://mcp-velociraptor:8000/mcp",
            }
            self.register_client(client_name, url_map[client_name])
            client = self.clients[client_name]

        return await client.call_tool(tool_name, tool_args)

    async def list_tools(self):
        # 0. Fetch configuration to check enabled status
        from models import SystemConfig, SessionLocal
        mcp_enabled = {
            "wazuh": True,
            "falcon": True,
            "velociraptor": True,
            "tavily": True,
            "ssh_exec": True # Always enabled for now as it's core
        }
        
        try:
            async with SessionLocal() as db:
                result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
                config = result.scalar_one_or_none()
                if config and config.mcp_config:
                    mcp_cfg = json.loads(config.mcp_config)
                    for key in mcp_enabled:
                        if key in mcp_cfg:
                            mcp_enabled[key] = mcp_cfg[key].get("enabled", True)
        except Exception as e:
            print(f"[ToolDispatcher] Error checking tool status: {e}")

        # 1. Internal tools
        all_tools = []
        
        # SSH Exec Internal Tools
        if mcp_enabled["ssh_exec"]:
            all_tools.extend([
                {
                    "name": "deploy_monitoring_task",
                    "description": "Deploy a new monitoring task to the background runner.",
                    "provider": "SSH Exec",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "Task title"},
                            "tool_name": {"type": "string", "description": "MCP tool to run"},
                            "tool_args": {"type": "object", "description": "Arguments for the tool"},
                            "threshold_condition": {"type": "string", "description": "Criteria for status (JSON string)"},
                            "interval_minutes": {"type": "integer", "description": "Running interval"}
                        }
                    }
                },
                {
                    "name": "execute_host_command",
                    "description": "Execute a shell command on a target host via SSH.",
                    "provider": "SSH Exec",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "target": {"type": "string", "description": "IP address or name of the target asset"},
                            "command": {"type": "string", "description": "The shell command to execute"}
                        }
                    }
                },
                {
                    "name": "upload_file_to_host",
                    "description": "Upload a file to a remote host via SFTP.",
                    "provider": "SSH Exec",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "target": {"type": "string", "description": "IP address or name of the target asset"},
                            "remote_path": {"type": "string", "description": "Full remote path including filename"},
                            "content_b64": {"type": "string", "description": "Base64-encoded file content"}
                        },
                        "required": ["target", "remote_path", "content_b64"]
                    }
                }
            ])

        # Web Search (Tavily) Internal Tool
        if mcp_enabled["tavily"]:
            all_tools.append({
                "name": "search_web",
                "description": "Search the web for up-to-date information (CVE details, vulnerability advisories, version info). Requires TAVILY_API_KEY.",
                "provider": "Web Search",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query string"}
                    },
                    "required": ["query"]
                }
            })

        # 2. External tools from registered clients
        provider_clients = {
            "wazuh": "http://mcp-wazuh:3000/mcp",
            "falcon": "http://mcp-falcon:9000/mcp",
            "velociraptor": "http://mcp-velociraptor:8000/mcp",
        }

        provider_display = {
            "wazuh": "Wazuh",
            "falcon": "Falcon",
            "velociraptor": "Velociraptor",
        }

        for name, url in provider_clients.items():
            if not mcp_enabled.get(name, True):
                continue
                
            if name not in self.clients:
                self.register_client(name, url)
            
            client = self.clients[name]
            display = provider_display.get(name, name.capitalize())
            try:
                res = await client.list_tools()
                if "result" in res and "tools" in res["result"]:
                    tools = res["result"]["tools"]
                    if tools:
                        for tool in tools:
                            tool["provider"] = display
                        all_tools.extend(tools)
                    else:
                        all_tools.append({
                            "name": f"_offline_{name}",
                            "provider": display,
                            "description": "No tools available from this service.",
                            "_offline": True
                        })
                else:
                    all_tools.append({
                        "name": f"_offline_{name}",
                        "provider": display,
                        "description": "Service returned an unexpected response.",
                        "_offline": True
                    })
            except Exception as e:
                print(f"[ToolDispatcher] Failed to list tools from client {name}: {e}")
                all_tools.append({
                    "name": f"_offline_{name}",
                    "provider": display,
                    "description": f"Service unreachable: {str(e)[:120]}",
                    "_offline": True
                })

        return all_tools

        return all_tools

dispatcher = ToolDispatcher()
