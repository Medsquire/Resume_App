from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Dict, List

from openai import OpenAI


STOP_WORDS = {
    "the", "and", "for", "with", "you", "your", "are", "our", "this", "that", "will", "from", "have", "has",
    "into", "been", "their", "they", "them", "who", "what", "where", "when", "than", "then", "should", "must",
    "able", "work", "team", "role", "job", "year", "years", "experience", "skills", "skill", "using", "use",
}


@dataclass
class Tool:
    name: str
    description: str
    required_fields: List[str]
    handler: Callable[[Dict], Dict]


class AgentRegistry:
    def __init__(self) -> None:
        self.tools: Dict[str, Tool] = {}
        self._register_default_tools()

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def list_tools(self) -> List[Tool]:
        return list(self.tools.values())

    def detect_tool(self, task_text: str) -> str:
        task = (task_text or "").lower()
        if any(word in task for word in ["search", "find", "role query", "job query"]):
            return "job_search_agent"
        if any(word in task for word in ["optimize", "rewrite", "tailor", "resume builder", "ats resume"]):
            return "resume_optimizer_agent"
        if any(word in task for word in ["score", "ats score", "match score"]):
            return "ats_scoring_agent"
        if any(word in task for word in ["gap", "missing", "improve skill", "skill gap"]):
            return "skill_gap_agent"

        # Default tool for generic AI resume requests.
        return "resume_optimizer_agent"

    def execute(self, task_text: str, payload: Dict) -> Dict:
        tool_name = task_text if task_text in self.tools else self.detect_tool(task_text)
        tool = self.tools.get(tool_name)
        if tool is None:
            raise ValueError(f"Unknown tool: {tool_name}")

        missing = [field for field in tool.required_fields if not payload.get(field)]
        if missing:
            raise ValueError(f"Missing required fields for {tool.name}: {', '.join(missing)}")

        result = tool.handler(payload)
        return {
            "tool_used": tool.name,
            "result": result,
        }

    def _register_default_tools(self) -> None:
        self.register(
            Tool(
                name="job_search_agent",
                description="Generate a structured job description and priority keywords from a role query.",
                required_fields=["role_query"],
                handler=self._job_search_agent,
            )
        )
        self.register(
            Tool(
                name="resume_optimizer_agent",
                description="Optimize resume against a job description using ATS-friendly structure.",
                required_fields=["resume_text", "job_description"],
                handler=self._resume_optimizer_agent,
            )
        )
        self.register(
            Tool(
                name="ats_scoring_agent",
                description="Compute ATS keyword and section score for a resume.",
                required_fields=["resume_text", "job_description"],
                handler=self._ats_scoring_agent,
            )
        )
        self.register(
            Tool(
                name="skill_gap_agent",
                description="Identify missing high-priority keywords and suggest improvements.",
                required_fields=["resume_text", "job_description"],
                handler=self._skill_gap_agent,
            )
        )

    def _client(self) -> OpenAI:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not configured.")
        return OpenAI(api_key=api_key)

    def _normalize(self, text: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+\s]", " ", (text or "").lower())).strip()

    def _top_keywords(self, text: str, limit: int = 25) -> List[str]:
        words = [w for w in self._normalize(text).split(" ") if w]
        freq: Dict[str, int] = {}
        for word in words:
            if len(word) < 3 or word in STOP_WORDS:
                continue
            freq[word] = freq.get(word, 0) + 1
        return [w for w, _ in sorted(freq.items(), key=lambda item: item[1], reverse=True)[:limit]]

    def _extract_json(self, raw: str) -> Dict:
        try:
            return json.loads(raw)
        except Exception as exc:
            raise ValueError("AI returned non-JSON output.") from exc

    def _job_search_agent(self, payload: Dict) -> Dict:
        prompt = (
            "Return strict JSON with keys: job_description (string), focus_keywords (string[]), notes (string). "
            f"Create a realistic ATS-friendly posting for: {payload['role_query']}"
        )
        response = self._client().chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.4,
            messages=[
                {"role": "system", "content": "You are a job analysis agent. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        raw = response.choices[0].message.content or "{}"
        data = self._extract_json(raw)
        return {
            "job_description": data.get("job_description", ""),
            "focus_keywords": data.get("focus_keywords", []),
            "notes": data.get("notes", "Generated by job_search_agent."),
        }

    def _resume_optimizer_agent(self, payload: Dict) -> Dict:
        response = self._client().chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.25,
            messages=[
                {
                    "role": "system",
                    "content": "You optimize resumes for ATS and return strict JSON only.",
                },
                {
                    "role": "user",
                    "content": (
                        "Return JSON keys: output_text (string), ats_score (number), notes (string), matched_keywords (string[]).\n"
                        "Use truthful claims only.\n\n"
                        f"Resume:\n{payload['resume_text']}\n\nJob Description:\n{payload['job_description']}"
                    ),
                },
            ],
        )
        raw = response.choices[0].message.content or "{}"
        data = self._extract_json(raw)

        ats_score = int(float(data.get("ats_score", 88)))
        ats_score = max(60, min(99, ats_score))

        return {
            "output_text": data.get("output_text", ""),
            "ats_score": ats_score,
            "matched_keywords": data.get("matched_keywords", []),
            "notes": data.get("notes", "Generated by resume_optimizer_agent."),
        }

    def _ats_scoring_agent(self, payload: Dict) -> Dict:
        resume = payload["resume_text"]
        job = payload["job_description"]

        keywords = self._top_keywords(job, limit=30)
        normalized_resume = self._normalize(resume)
        match_count = sum(1 for kw in keywords if kw in normalized_resume)
        coverage = (match_count / len(keywords) * 100) if keywords else 0

        has_sections = all(word in resume.lower() for word in ["summary", "skills", "experience"])
        has_bullets = bool(re.search(r"\n\s*[-*•]", resume))

        score = 45 + (coverage * 0.45)
        if has_sections:
            score += 12
        if has_bullets:
            score += 10
        score = int(max(35, min(99, round(score))))

        return {
            "ats_score": score,
            "keyword_coverage_percent": round(coverage, 2),
            "matched_keywords": [kw for kw in keywords if kw in normalized_resume][:20],
            "missing_keywords": [kw for kw in keywords if kw not in normalized_resume][:20],
        }

    def _skill_gap_agent(self, payload: Dict) -> Dict:
        resume = payload["resume_text"]
        job = payload["job_description"]

        keywords = self._top_keywords(job, limit=35)
        normalized_resume = self._normalize(resume)
        missing = [kw for kw in keywords if kw not in normalized_resume]

        recommendations = [
            f"Add measurable bullet points that include: {', '.join(missing[:5])}.",
            "Mirror exact terminology from the job description in summary and skills.",
            "Use standard ATS headings: PROFESSIONAL SUMMARY, CORE SKILLS, PROFESSIONAL EXPERIENCE.",
        ]

        return {
            "missing_keywords": missing[:20],
            "recommended_edits": recommendations,
            "priority_focus": missing[:8],
        }
