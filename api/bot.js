// api/bot.js
import OpenAI from "openai";

// Read raw form body in Vercel Node API (no req.text())
function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(new URLSearchParams(data || ""));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function askOpenAI(userText, context) {
  const sys = `You are a concise, friendly dental office phone assistant for ${context.business}.
- Hours: ${context.hours || "Mon–Fri 8am–5pm"}
- New patient special: ${context.special || "$129 exam + x‑rays + basic cleaning"}
- Services: ${context.services || "cleanings, exams, x‑rays, fillings, crowns, whitening, implants"}
- Insurances accepted: ${context.insurance || "many PPO plans"}
If caller asks to talk to a person, say you'll connect them.
Keep replies short (1–2 sentences), natural, and easy to speak.`;

  const resp = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: sys },
      { role: "user", content: userText },
    ],
    temperature: 0.3,
  });

  return (resp?.output_text || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const base = process.env.PUBLIC_URL || "";
    if (!process.env.OPENAI_API_KEY) {
      // Fail-safe: forward if AI not configured
      const twiml = `
<Response>
  <Say>Sorry, I'm having trouble right now. I'll connect you.</Say>
  <Dial>${process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER || ""}</Dial>
</Response>`.trim();
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    // Parse Twilio form data
    const form = await readFormBody(req);
    const speech =
      (form.get("SpeechResult") || form.get("speechResult") || "").trim();

    // If nothing heard, reprompt
    if (!speech) {
      const twiml = `
<Response>
  <Say>Sorry, I didn't catch that.</Say>
  <Gather input="speech" action="${base}/api/bot" method="POST" language="en-US" timeout="4">
    <Say>Please go ahead.</Say>
  </Gather>
  <Redirect>${base}/api/voice</Redirect>
</Response>`.trim();
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    // Human escalation keywords
    const keywords =
      (process.env.ESCALATION_KEYWORDS ||
        "representative,person,manager,human,call back,call me").toLowerCase();
    const wantsHuman = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .some((k) => speech.toLowerCase().includes(k));

    if (wantsHuman && (process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER)) {
      const twiml = `
<Response>
  <Say>Connecting you now. Please hold.</Say>
  <Dial>${process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER}</Dial>
</Response>`.trim();
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml);
      return;
    }

    // Call OpenAI for a natural reply
    const text = await askOpenAI(speech, {
      business: process.env.BUSINESS_NAME || "BrightSmiles Dental",
      hours: process.env.HOURS_TEXT,
      special: process.env.NEW_PATIENT_SPECIAL,
      services: process.env.SERVICES,
      insurance: process.env.INSURANCE_TEXT,
    });

    // Speak the reply and keep the loop going
    const twiml = `
<Response>
  <Say>${text || "Sorry, could you repeat that?"}</Say>
  <Gather input="speech" action="${base}/api/bot" method="POST" language="en-US" timeout="4">
    <Say>Anything else?</Say>
  </Gather>
  <Redirect>${base}/api/voice</Redirect>
</Response>`.trim();

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (err) {
    console.error("BOT ERROR:", err);
    const twiml = `
<Response>
  <Say>Sorry, I'm having trouble right now. I'll connect you.</Say>
  <Dial>${process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER || ""}</Dial>
</Response>`.trim();
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  }
}
