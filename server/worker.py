import os
import time
import json
import asyncio
from datetime import datetime
from redis import Redis
from rq import Worker, Queue
from sqlalchemy.future import select
from dotenv import load_dotenv

# Load .env file
load_dotenv()

from mcp_dispatcher import dispatcher
from models import SessionLocal, MonitoringTask, MonitoringResult

listen = ['high', 'default', 'low']
redis_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
conn = Redis.from_url(redis_url)

def run_security_audit(target_id: str):
    """
    Example long-running task: simulate a security audit.
    """
    print(f"Starting security audit for {target_id}...")
    # Simulate work
    for i in range(10):
        time.sleep(2)
        print(f"Audit progress for {target_id}: {(i+1)*10}%")
    
    print(f"Security audit for {target_id} completed.")
    return {"status": "success", "target_id": target_id, "findings": 0}

async def _run_mon_async(task_id: int):
    async with SessionLocal() as db:
        result = await db.execute(select(MonitoringTask).filter(MonitoringTask.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return {"error": "Task not found"}
        
        try:
            # Execute tool
            tool_args = json.loads(task.tool_args)
            
            # Inject target_agent if specified and not 'all'
            if task.target_agent and task.target_agent != "all":
                # Most Wazuh tools use 'agent_id'
                tool_args["agent_id"] = task.target_agent
            
            print(f"Executing monitoring tool: {task.tool_name} for task {task.id} (Agent: {task.target_agent})")
            tool_result = await dispatcher.execute(task.tool_name, tool_args)
            
            # Evaluate threshold
            status = "green"
            if task.threshold_condition:
                try:
                    # Simple threshold evaluation: result is available as 'res'
                    # e.g. "res['total'] > 10" -> amber or red
                    # For now, let's assume a simple format: condition_amber|condition_red
                    # Or just a single condition that turns it Red.
                    # Let's support a slightly more flexible eval
                    safe_namespace = {"res": tool_result, "json": json}
                    if eval(task.threshold_condition, {"__builtins__": {}}, safe_namespace):
                        status = "red"
                    else:
                        status = "green"
                except Exception as e:
                    print(f"Threshold eval error for task {task.id}: {e}")
                    status = "amber"
            
            # Save result
            new_res = MonitoringResult(
                task_id=task.id,
                status=status,
                result_data=json.dumps(tool_result)
            )
            db.add(new_res)
            task.last_run = datetime.utcnow()
            await db.commit()
            return {"status": status, "task_id": task.id}
        except Exception as e:
            print(f"Monitoring task {task.id} failed: {e}")
            return {"error": str(e)}

def run_monitoring_task(task_id: int):
    return asyncio.run(_run_mon_async(task_id))

if __name__ == '__main__':
    queues = [Queue(name, connection=conn) for name in listen]
    worker = Worker(queues, connection=conn)
    worker.work()
