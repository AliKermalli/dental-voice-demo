// api/bot.js
import OpenAI from "openai";
import { Readable } from "stream";
import { once } from "events";

// --- helpers to read Twilio's x-www-form-urlencoded body on Vercel ---
async function readRawBody(req) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  await once(req, "end");
  return Buffer.concat(chunks).toString("utf8");
}

function xml(twiml) {
  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export default async function handler(req, res) {
  try {
    // Twilio posts application/x-www-form-urlencoded
    const raw = await readRawBody(req);
    const params = new URLSearchParams(raw);
    const speech = (params.get("SpeechResult") || "").trim();
    const from = params.get("From") || "";

    // env config (set these in Vercel)
    const FORWARD_TO = process.env.FORWARD_TO || "";
    const BUSINESS_NAME = process.env.BUSINESS_NAME || "BrightSmiles Dental";
    const HOURS_TEXT =
      process.env.HOURS_TEXT ||
      "We are open Monday through Friday, 8 AM to 5 PM.";
    const INSURANCE_TEXT =
      process.env.INSURANCE_TEXT ||
      "We accept many PPO plans. Please bring your insurance card.";
    const SERVICES =
      process.env.SERVICES ||
      "cleanings, exams, x-rays, fillings, crowns, whitening, implants";
    const NEW_PATIENT_SPECIAL =
      process.env.NEW_PATIENT_SPECIAL ||
      "$129 exam + x‑rays + basic cleaning for new patients.";
    const ESCALATION_KEYWORDS =
      (process.env.ESCALATION_KEYWORDS || "human,representative,agent,manager,call back").toLowerCase();

    // If caller said nothing, re-prompt
    if (!speech) {
      return xml(`
        <Response>
          <Say>Sorry, I didn't catch that.</Say>
          <Redirect>/api/voice</Redirect>
        </Response>
      `.trim());
    }

    // Escalation keywords -> immediately forward
    const needsHuman = ESCALATION_KEYWORDS.split(",").some(k =>
      speech.toLowerCase().includes(k.trim())
    );
    if (needsHuman && FORWARD_TO) {
      return xml(`
        <Response>
          <Say>Okay, connecting you to our receptionist now. Please hold.</Say>
          <Dial>${FORWARD_TO}</Dial>
        </Response>
      `.trim());
    }

    // Call OpenAI for a natural reply
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You are a friendly, concise dental office receptionist for ${BUSINESS_NAME}.
Keep responses short and natural for phone speech (one or two sentences).
If asked about hours, say: ${HOURS_TEXT}
If asked about insurances, say: ${INSURANCE_TEXT}
If asked about services, mention: ${SERVICES}
If asked about promotions/new patient special, say: ${NEW_PATIENT_SPECIAL}
Offer to schedule an appointment or take a message if appropriate.
If caller asks to speak to a human or is upset, say you'll connect them and reply with the keyword: ESCALATE.
    `.trim();

    const user = `Caller said: "${speech}"`;

    // Use a small, fast model for latency; keep text-only
    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const reply =
      completion?.output_text?.trim() ||
      "Sorry, I didn't catch that. Could you repeat that?";

    // If the model requests escalation, forward
    if (reply.toLowerCase().includes("escalate") && FORWARD_TO) {
      return xml(`
        <Response>
          <Say>Okay, connecting you to our receptionist now. Please hold.</Say>
          <Dial>${FORWARD_TO}</Dial>
        </Response>
      `.trim());
    }

    // Otherwise, say the reply and keep the conversation going
    return xml(`
      <Response>
        <Say>${reply}</Say>
        <Redirect>/api/voice</Redirect>
      </Response>
    `.trim());
  } catch (err) {
    console.error(err);
    // Fallback: forward if possible
    if (process.env.FORWARD_TO) {
      return xml(`
        <Response>
          <Say>Sorry, I'm having trouble right now. I'll connect you to our receptionist.</Say>
          <Dial>${process.env.FORWARD_TO}</Dial>
        </Response>
      `.trim());
    }
    return xml(`
      <Response>
        <Say>Sorry, I'm having trouble right now. Please call back later.</Say>
        <Hangup/>
      </Response>
    `.trim());
  }
}
