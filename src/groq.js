const CATEGORIES = new Set(["phishing", "scam", "fake_news", "inappropriate_content", "suspicious_download", "safe"]);

export function parseAssessment(content) {
  const value = JSON.parse(content);
  const category = CATEGORIES.has(value.category) ? value.category : "safe";
  return {
    is_suspicious: Boolean(value.is_suspicious) && category !== "safe",
    category,
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    reason: String(value.reason || "No clear safety concern found.").slice(0, 500)
  };
}

export async function classifyWithGroq({ text, urls, safeBrowsing, attachment }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0.1,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "family_guard_assessment",
          strict: true,
          schema: {
            type: "object", additionalProperties: false,
            properties: {
              is_suspicious: { type: "boolean" },
              category: { type: "string", enum: [...CATEGORIES] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" }
            },
            required: ["is_suspicious", "category", "confidence", "reason"]
          }
        }
      },
      messages: [
        { role: "system", content: "You are Family Guard, a calm family-group safety assistant. Assess the supplied message, URL(s), attachment metadata, and Safe Browsing result. Flag credible phishing, scams (including fake promotions and typo-squatting), misleading/fake-news forwards, adult content unsuitable for a family group, or suspicious downloads. Treat Safe Browsing hits and APK attachments as strong evidence. Be conservative: do not flag normal conversation, ordinary opinions, harmless promotions, or unfamiliar-but-unremarkable links. Give one warm, plain-language, non-shaming reason. Return only the required JSON." },
        { role: "user", content: JSON.stringify({ message: text || "(no text)", urls, attachment: attachment || null, safe_browsing: { checked: safeBrowsing.checked, threats_found: safeBrowsing.threats.length, matches: safeBrowsing.threats } }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`Groq returned ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return parseAssessment(data.choices?.[0]?.message?.content || "{}");
}
