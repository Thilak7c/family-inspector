import "dotenv/config";

if (!process.env.SAFE_BROWSING_API_KEY) throw new Error("SAFE_BROWSING_API_KEY is required.");

const url = "https://testsafebrowsing.appspot.com/s/phishing.html";
const response = await fetch(
  `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(process.env.SAFE_BROWSING_API_KEY)}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client: { clientId: "family-guard-test", clientVersion: "0.1.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }]
      }
    })
  }
);
const data = await response.json();
if (!response.ok) throw new Error(`Safe Browsing HTTP ${response.status}: ${JSON.stringify(data)}`);
if (!data.matches?.length) throw new Error("The official phishing test URL was not flagged.");
console.log(`PASS: Safe Browsing flagged the test URL (${data.matches.length} match).`);
