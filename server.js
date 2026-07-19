require("dotenv").config();
const path = require("path");
const express = require("express");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in .env");
  }
  return new OpenAI({ apiKey });
}

function safeParseJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (_) {
    const fenced = String(rawText || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (_inner) {
        return null;
      }
    }
    return null;
  }
}

async function askModelForJson(client, { system, user, temperature = 0.2 }) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || "{}";
  const data = safeParseJson(content);
  if (!data) {
    throw new Error("AI returned unexpected JSON output.");
  }
  return data;
}

function buildOutputText(payload) {
  const name = payload.name || "FULL NAME";
  const cityState = payload.cityState || "City, State";
  const phone = payload.phone || "000-000-0000";
  const email = payload.email || "phone@email.com";
  const linkedin = payload.linkedin || "LinkedIn URL";
  const summary = payload.summary || "Results-driven professional focused on measurable outcomes.";
  const skills = Array.isArray(payload.skills) ? payload.skills.join(", ") : "Communication, Collaboration, Problem Solving";
  const experienceBullets = Array.isArray(payload.experienceBullets) ? payload.experienceBullets : [];
  const education = payload.education || "Degree Name - Institution Name";
  const certifications = Array.isArray(payload.certifications) && payload.certifications.length
    ? payload.certifications.join("; ")
    : "Add role-relevant certifications here";

  return [
    String(name).toUpperCase(),
    `${cityState} | ${phone} | ${email} | ${linkedin}`,
    "",
    "PROFESSIONAL SUMMARY",
    summary,
    "",
    "CORE SKILLS",
    skills,
    "",
    "PROFESSIONAL EXPERIENCE",
    "Most Recent Job Title - Company Name | MM/YYYY - Present",
    ...experienceBullets.map((b) => `- ${b}`),
    "",
    "EDUCATION",
    education,
    "",
    "CERTIFICATIONS",
    certifications
  ].join("\n");
}

app.post("/api/agent-search", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }

  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "You are an AI recruiting assistant. Return strict JSON only."
        },
        {
          role: "user",
          content: `Create a realistic ATS-friendly job description for this search query: ${query}. Return JSON with keys: jobDescription (string), focusKeywords (string[]), notes (string).`
        }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const data = safeParseJson(content);
    if (!data) {
      return res.status(502).json({ error: "AI returned unexpected output." });
    }

    return res.json({
      jobDescription: String(data.jobDescription || ""),
      focusKeywords: Array.isArray(data.focusKeywords) ? data.focusKeywords : [],
      notes: String(data.notes || "")
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Agent search failed." });
  }
});

app.post("/api/optimize-resume", async (req, res) => {
  const resumeText = String(req.body?.resumeText || "").trim();
  const jobDescription = String(req.body?.jobDescription || "").trim();

  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: "resumeText and jobDescription are required." });
  }

  try {
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: "You optimize resumes for ATS compatibility. Keep claims truthful and avoid fabrication. Return strict JSON only."
        },
        {
          role: "user",
          content: [
            "Using the resume and job description below, produce ATS-optimized content and auto-bind contact data from the resume.",
            "Return JSON keys only:",
            "name, cityState, phone, email, linkedin, summary, skills (string array), experienceBullets (string array), education, certifications (string array), atsScore (number), notes.",
            "Rules:",
            "- ATS score should reflect keyword coverage and structure quality.",
            "- Target 90+ when possible without fake information.",
            "- Keep resume format plain text with standard section headings.",
            "Resume:",
            resumeText,
            "Job Description:",
            jobDescription
          ].join("\n\n")
        }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const data = safeParseJson(content);
    if (!data) {
      return res.status(502).json({ error: "AI returned unexpected output." });
    }

    const outputText = buildOutputText(data);
    const atsScore = Math.max(60, Math.min(99, Number(data.atsScore || 90)));

    return res.json({
      outputText,
      atsScore,
      notes: String(data.notes || "AI optimized and auto-bound your resume data.")
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Resume optimization failed." });
  }
});

app.post("/api/deep-ai-resume", async (req, res) => {
  const description = String(req.body?.description || "").trim();
  const baseProfile = req.body?.baseProfile || {};

  if (!description) {
    return res.status(400).json({ error: "description is required." });
  }

  try {
    const client = getClient();

    const analysis = await askModelForJson(client, {
      system: "You are a senior ATS resume analysis agent. Return JSON only.",
      user: [
        "Analyze the job description for ATS optimization.",
        "Return JSON keys:",
        "mustHaveKeywords (string[]), optionalKeywords (string[]), seniority (string), roleFocus (string[]), recruiterIntent (string), warnings (string[]).",
        "Job Description:",
        description
      ].join("\n\n"),
      temperature: 0.1
    });

    const writer = await askModelForJson(client, {
      system: "You are an expert resume writer agent. Rewrite content truthfully and ATS-friendly. Return JSON only.",
      user: [
        "Use the candidate profile and job analysis to create a high-quality tailored resume section output.",
        "Rules:",
        "- Keep claims realistic and no fabrication.",
        "- Prioritize measurable impact bullets.",
        "- Align key skills, summary, technical skills, and experience to role intent.",
        "Return JSON keys:",
        "summary (string), keySkills (string[]), technicalSkills (object with category:string[]), experiences (array of {title,company,time,projects,tech,bullets:string[]}), notes (string[]).",
        "Candidate Base Profile JSON:",
        JSON.stringify(baseProfile),
        "Job Analysis JSON:",
        JSON.stringify(analysis),
        "Job Description:",
        description
      ].join("\n\n"),
      temperature: 0.25
    });

    const auditor = await askModelForJson(client, {
      system: "You are an ATS auditor agent. Score resume-job alignment and suggest fixes. Return JSON only.",
      user: [
        "Evaluate ATS alignment quality for the tailored resume below against the given job description.",
        "Return JSON keys:",
        "atsScore (number 0-100), matchedKeywords (string[]), missingKeywords (string[]), improvementActions (string[]).",
        "Tailored Resume JSON:",
        JSON.stringify(writer),
        "Job Analysis JSON:",
        JSON.stringify(analysis),
        "Job Description:",
        description
      ].join("\n\n"),
      temperature: 0.1
    });

    const safeAts = Math.max(60, Math.min(99, Number(auditor.atsScore || 88)));
    const outputAts = safeAts < 90 ? Math.min(99, safeAts + 5) : safeAts;

    return res.json({
      summary: String(writer.summary || ""),
      keySkills: Array.isArray(writer.keySkills) ? writer.keySkills : [],
      technicalSkills: typeof writer.technicalSkills === "object" && writer.technicalSkills ? writer.technicalSkills : {},
      experiences: Array.isArray(writer.experiences) ? writer.experiences : [],
      atsScore: outputAts,
      analysisNotes: [
        ...(Array.isArray(writer.notes) ? writer.notes : []),
        ...(Array.isArray(auditor.improvementActions) ? auditor.improvementActions : [])
      ],
      matchedKeywords: Array.isArray(auditor.matchedKeywords) ? auditor.matchedKeywords : [],
      missingKeywords: Array.isArray(auditor.missingKeywords) ? auditor.missingKeywords : []
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Deep AI resume build failed." });
  }
});

app.get("/api/health", (_req, res) => {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  res.json({ ok: true, openaiConfigured: configured });
});

app.listen(PORT, () => {
  console.log(`Medsquire AI server running on http://localhost:${PORT}`);
});
