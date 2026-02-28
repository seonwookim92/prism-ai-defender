from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime
import os
import json

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://prism:prism_pass@db:5432/prism_db")

engine = create_async_engine(DATABASE_URL, echo=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class SystemConfig(Base):
    __tablename__ = "system_configs"
    key: Mapped[str] = mapped_column(primary_key=True)
    control_mode: Mapped[str] = mapped_column(default="ADVISOR")
    assets: Mapped[str] = mapped_column(default="[]")  # JSON list of asset dicts: [{name, ip, user, pass}]
    llm_provider: Mapped[str] = mapped_column(default="openai") # current active provider
    llm_model: Mapped[str] = mapped_column(default="gpt-4o") # current active model
    llm_configs: Mapped[str] = mapped_column(default="{}") # JSON: {provider: {apiKey: str, model: str}}
    mcp_config: Mapped[str] = mapped_column(default="{}")
    keystore: Mapped[str] = mapped_column(default="[]") # JSON list of keys: [{id, name, private_key}]
    onboarded: Mapped[bool] = mapped_column(default=False)

class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    severity: Mapped[str] = mapped_column()
    source: Mapped[str] = mapped_column()
    message: Mapped[str] = mapped_column()
    details: Mapped[Optional[str]] = mapped_column()

class MonitoringTask(Base):
    __tablename__ = "monitoring_tasks"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column()
    tool_name: Mapped[str] = mapped_column()
    tool_args: Mapped[str] = mapped_column(default="{}") # JSON string
    threshold_condition: Mapped[Optional[str]] = mapped_column() # e.g. "result['count'] > 10"
    interval_minutes: Mapped[int] = mapped_column(default=5)
    target_agent: Mapped[Optional[str]] = mapped_column() # ID or "all"
    enabled: Mapped[bool] = mapped_column(default=True)
    last_run: Mapped[Optional[datetime]] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    # Action executed when threshold triggers
    action_tool_name: Mapped[Optional[str]] = mapped_column()  # e.g. "execute_host_command"
    action_tool_args: Mapped[Optional[str]] = mapped_column()  # JSON string with {{template}} vars

class MonitoringResult(Base):
    __tablename__ = "monitoring_results"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column() # green, amber, red
    result_data: Mapped[str] = mapped_column() # JSON string
    timestamp: Mapped[datetime] = mapped_column(default=datetime.utcnow)

class Playbook(Base):
    __tablename__ = "playbooks"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column()
    blocks: Mapped[str] = mapped_column(default="[]")  # JSON array of Block objects
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

async def get_db():
    async with SessionLocal() as session:
        yield session

from sqlalchemy import text

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Check for missing columns and add them (Development migration)
        if "postgresql" in DATABASE_URL:
            try:
                # List of columns to check and their migration SQL
                columns_to_check = [
                    ("llm_provider", "VARCHAR DEFAULT 'openai'"),
                    ("llm_model", "VARCHAR DEFAULT 'gpt-4o'"),
                    ("llm_configs", "TEXT DEFAULT '{}'"),
                    ("mcp_config", "TEXT DEFAULT '{}'"),
                    ("assets", "TEXT DEFAULT '[]'"),
                    ("keystore", "TEXT DEFAULT '[]'"),
                    ("onboarded", "BOOLEAN DEFAULT FALSE")
                ]
                
                for col_name, col_def in columns_to_check:
                    res = await conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='system_configs' AND column_name='{col_name}'"))
                    if not res.fetchone():
                        print(f"Adding missing column: {col_name}")
                        await conn.execute(text(f"ALTER TABLE system_configs ADD COLUMN {col_name} {col_def}"))
                
                # Migration for monitoring_tasks
                res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='monitoring_tasks' AND column_name='target_agent'"))
                if not res.fetchone():
                    print("Adding missing column target_agent to monitoring_tasks")
                    await conn.execute(text("ALTER TABLE monitoring_tasks ADD COLUMN target_agent VARCHAR DEFAULT 'all'"))

                # New: Actions migration
                action_cols = [
                    ("action_tool_name", "VARCHAR"),
                    ("action_tool_args", "TEXT")
                ]
                for col_name, col_def in action_cols:
                    res = await conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='monitoring_tasks' AND column_name='{col_name}'"))
                    if not res.fetchone():
                        print(f"Adding missing column: {col_name} to monitoring_tasks")
                        await conn.execute(text(f"ALTER TABLE monitoring_tasks ADD COLUMN {col_name} {col_def}"))

            except Exception as e:
                print(f"Migration error: {e}")
