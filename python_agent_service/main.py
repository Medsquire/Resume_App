from __future__ import annotations

import os
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from agents.models import AgentResponse, ExecuteRequest, ToolInfo
from agents.registry import AgentRegistry

load_dotenv()

app = FastAPI(title="Medsquire Python Agent Service", version="1.0.0")
registry = AgentRegistry()


@app.get("/health")
def health() -> Dict[str, bool]:
    return {
        "ok": True,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY", "").strip()),
    }


@app.get("/agents", response_model=list[ToolInfo])
def list_agents() -> list[ToolInfo]:
    return [
        ToolInfo(name=tool.name, description=tool.description, required_fields=tool.required_fields)
        for tool in registry.list_tools()
    ]


@app.post("/agent/execute", response_model=AgentResponse)
def execute_agent(request: ExecuteRequest) -> AgentResponse:
    payload = {
        "resume_text": request.resume_text,
        "job_description": request.job_description,
        "role_query": request.role_query,
        "context": request.context,
    }
    try:
        output = registry.execute(request.task, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AgentResponse(task=request.task, tool_used=output["tool_used"], result=output["result"])
