"""
monitor_runner.py
-----------------
Inline monitoring executor.
Runs MCP tools directly (no RQ/Redis serialization) and stores
rich result logs: raw tool output + threshold evaluation details.
"""

import json
import traceback
from datetime import datetime
from sqlalchemy.future import select

from mcp_dispatcher import dispatcher
from models import SessionLocal, MonitoringTask, MonitoringResult


def _apply_parser_rules(parser_rules: dict, tool_result) -> dict:
    """Apply parser rules (regex/JSONPath) to tool_result and return extracted variables."""
    import re as _re
    parsed = {}
    # Prefer stdout for text-based parsing
    if isinstance(tool_result, dict):
        search_text = tool_result.get("stdout") or json.dumps(tool_result, ensure_ascii=False)
    else:
        search_text = str(tool_result)

    for var_name, path in parser_rules.items():
        if not isinstance(path, str):
            continue
        if path.startswith("$."):
            # JSONPath: simple key traversal
            parts = path[2:].split(".")
            cur = tool_result
            for p in parts:
                if isinstance(cur, dict):
                    cur = cur.get(p)
                else:
                    cur = None
                    break
            parsed[var_name] = cur
        elif path.startswith("regex("):
            m = _re.match(r'^regex\("((?:[^"\\]|\\.)*)",\s*(\d+)\)$', path)
            if m:
                pattern = m.group(1).replace('\\"', '"')
                group = int(m.group(2))
                try:
                    match = _re.search(pattern, search_text)
                    parsed[var_name] = match.group(group) if match else None
                except Exception:
                    parsed[var_name] = None
    return parsed


def _evaluate_threshold_json(cond: dict, tool_result) -> str:
    """Evaluate a Builder-generated threshold JSON against tool_result.
    Returns 'green', 'amber', or 'red'.
    """
    mode = cond.get("mode", "")
    if mode == "contains":
        result_str = str(tool_result).lower()
        contains = [c.lower() for c in cond.get("contains", [])]
        not_contains = [c.lower() for c in cond.get("not_contains", [])]
        match_level = cond.get("match_level", "red")
        for nc in not_contains:
            if nc in result_str:
                return "green"
        for c in contains:
            if c in result_str:
                return match_level
        return "green"
    elif mode == "variable":
        # Evaluate numeric/comparison rules against parsed variables
        parser_rules = cond.get("parserRules", {})
        rules = cond.get("rules", [])
        if not rules:
            return "green"
        parsed_vars = _apply_parser_rules(parser_rules, tool_result) if parser_rules else {}
        status = "green"
        for rule in rules:
            var_name = rule.get("var")
            op = rule.get("op")
            value = rule.get("value")
            level = rule.get("level", "red")
            raw_val = parsed_vars.get(var_name)
            if raw_val is None:
                continue
            try:
                val = float(str(raw_val))
                threshold = float(str(value))
            except (ValueError, TypeError):
                continue
            triggered = (
                (op == ">" and val > threshold) or
                (op == ">=" and val >= threshold) or
                (op == "<" and val < threshold) or
                (op == "<=" and val <= threshold) or
                (op == "==" and val == threshold)
            )
            if triggered:
                if level == "red":
                    return "red"
                elif level == "amber" and status == "green":
                    status = "amber"
        return status
    elif mode in ("structured", "ai", "binary"):
        # Natural language / AI conditions cannot be auto-evaluated → amber (needs review)
        return "amber"
    return "green"


async def execute_monitoring_task(task_id: int) -> dict:
    """
    Execute a single monitoring task:
      1. Fetch task config from DB
      2. Call the MCP tool directly via dispatcher
      3. Evaluate threshold condition
      4. Save a MonitoringResult with FULL raw output + eval log
    """
    async with SessionLocal() as db:
        result = await db.execute(
            select(MonitoringTask).filter(MonitoringTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            return {"error": f"Task {task_id} not found"}

        exec_log = {
            "task_id": task.id,
            "task_title": task.title,
            "tool_name": task.tool_name,
            "executed_at": datetime.utcnow().isoformat() + "Z",
        }

        try:
            # ---- 1. Parse tool args ----
            if isinstance(task.tool_args, str):
                tool_args = json.loads(task.tool_args) if task.tool_args else {}
            else:
                tool_args = task.tool_args or {}

            # ---- Parse target list ----
            raw_ta = task.target_agent or "all"
            if raw_ta == "all":
                targets = []
            else:
                try:
                    targets = json.loads(raw_ta)
                    if isinstance(targets, str):
                        targets = [targets] if targets else []
                except Exception:
                    targets = [raw_ta] if raw_ta else []

            # ---- 2. Call MCP tool (per target for SSH, single call for others) ----
            print(f"[Monitor] Executing {task.tool_name} for task '{task.title}' (ID:{task.id}), targets={targets or 'all'}")

            if task.tool_name == "execute_host_command" and targets:
                # Run once per target IP, collect results keyed by IP
                import re as _re
                all_results = {}
                for target_ip in targets:
                    # Replace {target} or any {placeholder} in string values with the actual IP
                    resolved = {
                        k: _re.sub(r'\{[^}]+\}', target_ip, v) if isinstance(v, str) else v
                        for k, v in tool_args.items()
                    }
                    run_args = {**resolved, "target": target_ip}
                    print(f"[Monitor] SSH exec → target={target_ip}, cmd={run_args.get('command')}")
                    res = await dispatcher.execute(task.tool_name, run_args)
                    all_results[target_ip] = res
                tool_result = all_results
                exec_log["tool_args_sent"] = {"targets": targets, **tool_args}
            else:
                # For Wazuh tools: inject agent_id if single target
                if targets and len(targets) == 1:
                    tool_args["agent_id"] = targets[0]
                exec_log["tool_args_sent"] = tool_args
                tool_result = await dispatcher.execute(task.tool_name, tool_args)

            exec_log["raw_output"] = tool_result
            print(f"[Monitor] Tool returned {type(tool_result).__name__}")

            # ---- 3. Evaluate threshold ----
            status = "green"
            threshold_log = {"condition": task.threshold_condition, "triggered": False, "error": None}

            if task.threshold_condition:
                try:
                    # Try Builder JSON format first
                    try:
                        cond_json = json.loads(task.threshold_condition)
                        status = _evaluate_threshold_json(cond_json, tool_result)
                        threshold_log["triggered"] = (status == "red")
                        threshold_log["mode"] = cond_json.get("mode")
                    except (json.JSONDecodeError, TypeError):
                        # Legacy: Python expression eval
                        safe_ns = {"res": tool_result, "json": json, "len": len, "int": int, "str": str, "float": float}
                        triggered = bool(eval(task.threshold_condition, {"__builtins__": {}}, safe_ns))
                        threshold_log["triggered"] = triggered
                        status = "red" if triggered else "green"

                    if status == "red":
                        print(f"[Monitor] ⚠ ALERT: threshold triggered for task '{task.title}'")
                    elif status == "amber":
                        print(f"[Monitor] ⚠ AMBER: threshold needs manual review for task '{task.title}'")
                    else:
                        print(f"[Monitor] ✓ Threshold OK for task '{task.title}'")
                except Exception as e:
                    threshold_log["error"] = str(e)
                    status = "amber"
                    print(f"[Monitor] Threshold eval error for task '{task.title}': {e}")
            else:
                threshold_log["condition"] = None
                print(f"[Monitor] No threshold set for task '{task.title}', status=green")

            exec_log["threshold_eval"] = threshold_log
            exec_log["final_status"] = status

            # ---- 4. Execute Action if triggered ----
            if status == "red" and task.action_tool_name:
                print(f"[Monitor] Triggering action: {task.action_tool_name} for task '{task.title}'")
                try:
                    action_args_str = task.action_tool_args or "{}"
                    
                    # Template replacement: find {{key}} and replace with tool_result[key]
                    def template_replace(match):
                        key = match.group(1).strip()
                        # Deep lookup helper
                        def get_deep(obj, key_path):
                            for k in key_path.split('.'):
                                if isinstance(obj, dict): obj = obj.get(k)
                                elif isinstance(obj, list) and k.isdigit():
                                    idx = int(k)
                                    obj = obj[idx] if idx < len(obj) else None
                                else: return None
                            return obj
                        
                        val = get_deep(tool_result, key)
                        return str(val) if val is not None else match.group(0)

                    import re
                    processed_args_str = re.sub(r"\{\{([\w\.]+)\}\}", template_replace, action_args_str)
                    action_args = json.loads(processed_args_str)
                    
                    # Inject agent_id if applicable
                    if task.target_agent and task.target_agent != "all" and "agent_id" not in action_args:
                         action_args["agent_id"] = task.target_agent

                    print(f"[Monitor] Action args after template: {action_args}")
                    action_res = await dispatcher.execute(task.action_tool_name, action_args)
                    exec_log["action_execution"] = {
                        "tool": task.action_tool_name,
                        "args": action_args,
                        "result": action_res,
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }
                    print(f"[Monitor] Action executed: {task.action_tool_name}")
                except Exception as action_err:
                    print(f"[Monitor] Action execution failed: {action_err}")
                    exec_log["action_error"] = str(action_err)

            # ---- 5. Save result ----
            new_res = MonitoringResult(
                task_id=task.id,
                status=status,
                result_data=json.dumps(exec_log, ensure_ascii=False, default=str),
            )
            db.add(new_res)
            task.last_run = datetime.utcnow()
            await db.commit()

            print(f"[Monitor] Task '{task.title}' completed: status={status}")
            return {"status": status, "task_id": task.id}

        except Exception as e:
            tb = traceback.format_exc()
            exec_log["error"] = str(e)
            exec_log["traceback"] = tb
            exec_log["final_status"] = "error"
            print(f"[Monitor] Task '{task.title}' FAILED: {e}")

            # Save error result so it appears in logs
            new_res = MonitoringResult(
                task_id=task.id,
                status="error",
                result_data=json.dumps(exec_log, ensure_ascii=False, default=str),
            )
            db.add(new_res)
            task.last_run = datetime.utcnow()
            await db.commit()

            return {"error": str(e), "task_id": task.id}
