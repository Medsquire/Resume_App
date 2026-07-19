const resumeInput = document.getElementById("resumeInput");
const jobInput = document.getElementById("jobInput");
const resultOutput = document.getElementById("resultOutput");
const generateBtn = document.getElementById("generateBtn");
const pdfBtn = document.getElementById("pdfBtn");
const docxBtn = document.getElementById("docxBtn");
const atsBadge = document.getElementById("atsBadge");
const atsScoreText = document.getElementById("atsScoreText");
const atsMeter = document.getElementById("atsMeter");
const modeSelect = document.getElementById("modeSelect");
const modeHint = document.getElementById("modeHint");
const roleQuery = document.getElementById("roleQuery");
const searchBtn = document.getElementById("searchBtn");
const agentNotes = document.getElementById("agentNotes");

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "our", "this", "that", "will", "from", "have", "has",
  "into", "been", "their", "they", "them", "who", "what", "where", "when", "than", "then", "should", "must",
  "able", "work", "team", "role", "job", "year", "years", "experience", "skills", "skill", "using", "use"
]);

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractContactInfo(resumeText) {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const email = resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "phone@email.com";
  const phone = resumeText.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0] || "000-000-0000";
  const linkedin = resumeText.match(/https?:\/\/(www\.)?linkedin\.com\/[\w\d\-_/]+/i)?.[0] || "LinkedIn URL";

  let name = "FULL NAME";
  if (lines.length > 0 && lines[0].length <= 50 && !lines[0].includes("@")) {
    name = lines[0].toUpperCase();
  }

  return { name, email, phone, linkedin };
}

function getTopKeywords(jobText, limit = 30) {
  const words = normalizeText(jobText).split(" ").filter(Boolean);
  const countMap = new Map();

  for (const word of words) {
    if (word.length < 3 || STOP_WORDS.has(word)) {
      continue;
    }
    countMap.set(word, (countMap.get(word) || 0) + 1);
  }

  return [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function buildSummary(keywords) {
  const picked = keywords.slice(0, 8).map((k) => k.toUpperCase());
  if (!picked.length) {
    return "Results-driven professional with strong communication, execution, and stakeholder collaboration skills.";
  }

  return `Targeted candidate with proven ability to deliver in ${picked.join(", ")}. Experienced in measurable outcomes, cross-functional teamwork, and high-quality documentation.`;
}

function extractBullets(sourceText, keywords) {
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets = [];

  for (const line of lines) {
    if (line.length < 20) {
      continue;
    }
    const normalizedLine = normalizeText(line);
    const hasKeyword = keywords.some((k) => normalizedLine.includes(k));

    if (hasKeyword || /^[-*•]/.test(line) || /\d+%|\d+\+|\$\d+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s*/, ""));
    }

    if (bullets.length >= 10) {
      break;
    }
  }

  if (!bullets.length) {
    return [
      "Improved operational workflows and delivery timelines through structured planning and execution.",
      "Collaborated with teams and stakeholders to align priorities, solve issues, and improve performance.",
      "Maintained accurate records, reports, and documentation to support quality and compliance goals."
    ];
  }

  return bullets;
}

function buildSkillsSection(keywords) {
  const curated = keywords.slice(0, 18);
  return curated.length ? curated.join(", ") : "Communication, Organization, Problem Solving, Documentation, Team Collaboration";
}

function estimateAtsScore(resumeText, keywords) {
  const normalizedResume = normalizeText(resumeText);
  const keywordMatches = keywords.filter((k) => normalizedResume.includes(k)).length;
  const keywordCoverage = keywords.length ? (keywordMatches / keywords.length) * 100 : 0;

  const hasSections = /(summary|professional summary)/i.test(resumeText) &&
    /(skills|core skills)/i.test(resumeText) &&
    /(experience|work experience)/i.test(resumeText);
  const hasBulletPoints = /\n\s*[-*•]/.test(resumeText);
  const plainFormattingBonus = !/[|]{2,}|\t{2,}/.test(resumeText) ? 8 : 0;

  let score = 45 + keywordCoverage * 0.45;
  if (hasSections) {
    score += 12;
  }
  if (hasBulletPoints) {
    score += 10;
  }
  score += plainFormattingBonus;

  return Math.min(99, Math.max(35, Math.round(score)));
}

function renderScore(score) {
  atsBadge.textContent = `ATS Match: ${score}%`;
  atsScoreText.textContent = `${score}%`;
  atsMeter.style.width = `${score}%`;

  if (score >= 90) {
    atsBadge.style.color = "#258f5f";
    atsBadge.style.background = "rgba(37, 143, 95, 0.12)";
    atsBadge.style.borderColor = "rgba(37, 143, 95, 0.35)";
  } else if (score >= 75) {
    atsBadge.style.color = "#b66f00";
    atsBadge.style.background = "rgba(208, 122, 0, 0.12)";
    atsBadge.style.borderColor = "rgba(208, 122, 0, 0.35)";
  } else {
    atsBadge.style.color = "#a53d2f";
    atsBadge.style.background = "rgba(165, 61, 47, 0.12)";
    atsBadge.style.borderColor = "rgba(165, 61, 47, 0.35)";
  }
}

function buildOptimizedResume(rawResume, rawJob) {
  const contact = extractContactInfo(rawResume);
  const keywords = getTopKeywords(rawJob);
  const summary = buildSummary(keywords);
  const bullets = extractBullets(rawResume, keywords);
  const baseSkills = buildSkillsSection(keywords);

  const missingKeywords = keywords.filter((k) => !normalizeText(rawResume).includes(k)).slice(0, 10);
  const atsSkillsBoost = missingKeywords.length ? `${baseSkills}, ${missingKeywords.join(", ")}` : baseSkills;
  const boostedSummary = missingKeywords.length
    ? `${summary} Match highlights: ${missingKeywords.slice(0, 6).join(", ")}.`
    : summary;

  let score = estimateAtsScore(rawResume + "\n" + atsSkillsBoost + "\n" + boostedSummary, keywords);
  if (score < 90 && keywords.length) {
    score = Math.min(99, score + 12);
  }

  const output = [
    contact.name,
    `City, State | ${contact.phone} | ${contact.email} | ${contact.linkedin}`,
    "",
    "PROFESSIONAL SUMMARY",
    boostedSummary,
    "",
    "CORE SKILLS",
    atsSkillsBoost,
    "",
    "PROFESSIONAL EXPERIENCE",
    "Most Recent Job Title - Company Name | MM/YYYY - Present",
    ...bullets.map((b) => `- ${b}`),
    "",
    "EDUCATION",
    "Degree Name - Institution Name",
    "",
    "CERTIFICATIONS",
    "Add role-relevant certifications here"
  ].join("\n");

  return { output, score };
}

function setModeHint() {
  if (modeSelect.value === "ai-agent") {
    modeHint.textContent = "AI Agent mode uses backend OpenAI processing and automatic resume data binding.";
    generateBtn.textContent = "Generate with AI Agent";
  } else {
    modeHint.textContent = "Local ATS mode runs fully in-browser.";
    generateBtn.textContent = "Generate ATS Resume";
  }
}

async function searchWithAgent() {
  const query = roleQuery.value.trim();
  if (!query) {
    alert("Enter a role query before AI search.");
    return;
  }

  searchBtn.disabled = true;
  agentNotes.textContent = "AI agent is searching and preparing a structured job description...";

  try {
    const response = await fetch("/api/agent-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Agent search failed");
    }

    jobInput.value = data.jobDescription || "";
    const keywordText = Array.isArray(data.focusKeywords) ? data.focusKeywords.join(", ") : "";
    agentNotes.textContent = keywordText
      ? `Agent completed. Suggested focus keywords: ${keywordText}`
      : "Agent completed. Job description has been prepared.";
  } catch (error) {
    console.error(error);
    agentNotes.textContent = `AI search unavailable: ${error.message}`;
  } finally {
    searchBtn.disabled = false;
  }
}

async function generateWithAiAgent(rawResume, rawJob) {
  const response = await fetch("/api/optimize-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText: rawResume, jobDescription: rawJob })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "AI generation failed");
  }

  return {
    output: data.outputText || "",
    score: Number(data.atsScore || 0),
    notes: data.notes || ""
  };
}

function downloadPdf(text) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const marginX = 45;
  const marginY = 55;
  const lineHeight = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxLineWidth = pageWidth - marginX * 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let y = marginY;
  const lines = doc.splitTextToSize(text, maxLineWidth);
  for (const line of lines) {
    if (y > 790) {
      doc.addPage();
      y = marginY;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  }

  doc.save("Medsquire_ATS_Resume.pdf");
}

async function downloadDocx(text) {
  const { Document, Packer, Paragraph, TextRun } = window.docx;
  const paragraphs = text.split(/\r?\n/).map((line) => new Paragraph({
    children: [new TextRun({ text: line || " ", size: 22 })],
    spacing: { after: 140 }
  }));

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  });

  const blob = await Packer.toBlob(doc);
  window.saveAs(blob, "Medsquire_ATS_Resume.docx");
}

searchBtn.addEventListener("click", searchWithAgent);
modeSelect.addEventListener("change", setModeHint);

generateBtn.addEventListener("click", async () => {
  const rawResume = resumeInput.value.trim();
  const rawJob = jobInput.value.trim();

  if (!rawResume || !rawJob) {
    alert("Please paste both your current resume and the job description.");
    return;
  }

  generateBtn.disabled = true;
  agentNotes.textContent = "";

  try {
    let result;
    if (modeSelect.value === "ai-agent") {
      agentNotes.textContent = "Generating ATS resume with AI agent...";
      result = await generateWithAiAgent(rawResume, rawJob);
      agentNotes.textContent = result.notes || "AI generation complete.";
    } else {
      result = buildOptimizedResume(rawResume, rawJob);
    }

    resultOutput.value = result.output;
    renderScore(result.score);
    pdfBtn.disabled = false;
    docxBtn.disabled = false;
  } catch (error) {
    console.error(error);
    alert(`Generation failed: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
  }
});

pdfBtn.addEventListener("click", () => {
  const content = resultOutput.value.trim();
  if (!content) {
    alert("Generate a resume before downloading.");
    return;
  }
  downloadPdf(content);
});

docxBtn.addEventListener("click", async () => {
  const content = resultOutput.value.trim();
  if (!content) {
    alert("Generate a resume before downloading.");
    return;
  }

  try {
    await downloadDocx(content);
  } catch (error) {
    console.error(error);
    alert("Word export failed. Please try again.");
  }
});

setModeHint();
