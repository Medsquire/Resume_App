from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class ExecuteRequest(BaseModel):
    task: str = Field(..., description="Task name or natural-language request")
    resume_text: Optional[str] = None
    job_description: Optional[str] = None
    role_query: Optional[str] = None
    context: Dict[str, str] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    task: str
    tool_used: str
    result: Dict


class ToolInfo(BaseModel):
    name: str
    description: str
    required_fields: List[str]
