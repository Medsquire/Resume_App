# Medsquire AI Resume Builder



A web app that tailors resumes to job descriptions, supports AI Agent mode, and exports to PDF or Word format.

This repository now includes a Python multi-agent backend that can automatically select the right AI tool based on task intent.

## Features

- Paste current resume and job description
- Local ATS mode (fast in-browser generation)
- AI Agent mode (backend OpenAI optimization)
- AI agent search to generate job description from a role query
- Automatic data binding from your resume (name/email/phone/linkedin)
- ATS match score meter (targeting 90%+)
- Download as PDF
- Download as Word (.docx)
- Mobile and desktop responsive UI

## Run

1. Copy `.env.example` to `.env`.
2. Add your key: `OPENAI_API_KEY=your_real_key`.
3. Install dependencies: `npm install`.
4. Start server: `npm start`.
5. Open `http://localhost:3000`.

## AI Mode

- Choose **AI Agent Mode** in the UI.
- Optional: use **Search with AI Agent** to auto-create a structured job description.
- Click **Generate with AI Agent** to optimize and bind resume data automatically.

## Python AI Agents (All Tools)

Location: `python_agent_service/`

Included agents/tools:

- `job_search_agent`: Build structured job description from role query
- `resume_optimizer_agent`: Rewrite resume for ATS using AI
- `ats_scoring_agent`: Compute ATS score and missing keywords
- `skill_gap_agent`: Detect skill gaps and recommended edits

Automatic routing:

- Call one endpoint and pass a natural-language task.
- The router auto-selects the best tool.

Run Python agent service:

1. `cd python_agent_service`
2. `..\.venv\Scripts\python.exe -m pip install -r requirements.txt`
3. `..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`

API endpoints:

- `GET /health`
- `GET /agents`
- `POST /agent/execute`

Sample execute payload:

```json
{
	"task": "optimize my resume for ATS",
	"resume_text": "<paste resume>",
	"job_description": "<paste job description>"
}
```

## Notes

- ATS score is an estimated quality score and not an official recruiter ATS score.
- For best real-world ATS results, verify keywords against each target role and use your real contact details.
