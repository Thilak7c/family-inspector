export function extractUrls(text = "") {
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>]+/gi) || [];
  return [...new Set(matches
    .map((raw) => raw.replace(/[),.!?;:\]\}]+$/g, ""))
    .map((url) => (url.startsWith("www.") ? `https://${url}` : url)))];
}
