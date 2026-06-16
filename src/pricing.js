// Shared market-value logic so the home-page "Est. value" range and the
// detail-page "market value" estimate always use the same condition-aware
// reasoning and therefore agree.
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

const isMint = (c) => !!c && (c.includes("Mint") || c.includes("NM"));

// Build the condition-aware facts + pricing instruction shared by both calls.
export function pricingContext(item) {
  const mint = isMint(item.media_condition) && isMint(item.case_condition);

  const details = [
    `Format: ${item.type}`,
    `Title: ${item.title || "Unknown"}`,
    item.artist && `Artist/Studio: ${item.artist}`,
    item.year && `Year: ${item.year}`,
    `Media condition: ${item.media_condition || "Not specified"}`,
    `Case condition: ${item.case_condition || "Not specified"}`,
  ].filter(Boolean).join("\n");

  const priceInstruction = mint
    ? "Both media and case are Mint/Near-Mint. Price for that top condition — the realistic resale range a graded mint copy fetches on eBay/Discogs sold listings (PriceCharting-style)."
    : "Condition is below mint. Give the LOW-TO-MID resale range a typical used copy in this stated condition actually sells for — not the optimistic mint ceiling.";

  return { mint, details, priceInstruction };
}

async function callGroq(messages, maxTokens) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// Short range only, e.g. "$5–10". Used for the stored Est. value column.
export async function groqRange(item) {
  const { details, priceInstruction } = pricingContext(item);
  return callGroq(
    [
      {
        role: "system",
        content: `You are a physical media resale pricing expert using sold-listing/PriceCharting-style values. ${priceInstruction} Respond with ONLY a short price range like '$2–5' or '$10–20'. No words, no explanation. Just the range.`,
      },
      { role: "user", content: `Value this item:\n${details}` },
    ],
    20
  );
}

// Full prose estimate. Leads with the same range groqRange would give, then explains.
export async function groqDetail(item) {
  const { details, priceInstruction } = pricingContext(item);
  return callGroq(
    [
      {
        role: "system",
        content: `You are a physical media resale pricing expert using sold-listing/PriceCharting-style values. ${priceInstruction} START your reply with the price range on its own (e.g. "$5–10"), then under 100 words on key factors and demand. The leading range must reflect the stated condition.`,
      },
      { role: "user", content: `Market value for:\n${details}` },
    ],
    250
  );
}
