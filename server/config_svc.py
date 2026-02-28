import json
from models import SystemConfig, SessionLocal
from sqlalchemy.future import select

class ConfigService:
    async def get_config(self):
        async with SessionLocal() as db:
            result = await db.execute(select(SystemConfig).filter(SystemConfig.key == "main"))
            return result.scalar_one_or_none()

config_svc = ConfigService()
