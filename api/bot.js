import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// tiny helper – safe text extraction from OpenAI Responses API
async function askOpenAI(userText, context) {
  const sys = `You are a concise, friendly dental office phone assistant for ${context.business}.
- Hours: ${context.hours || "Mon–Fri 8am–5pm"}
- New patient special: ${context.special || "$129 exam + x‑rays + basic cleaning"}
- Services: ${context.services || "cleanings, exams, x‑rays, fillings, crowns, whitening, implants"}
- Insurances accepted: ${context.insurance || "many PPO plans"}
- If caller asks to talk to a person, politely confirm and we will transfer them.
Keep replies short and conversational (1–2 sentences).`;

  const resp = await client.responses.create({
    model: "gpt-4o-mini", // low-latency, reliable
    input: [
      { role: "system", content: sys },
      { role: "user", content: userText }
    ],
    temperature: 0.3,
  });

  return (resp.output_text || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    // Twilio <Gather> posts form-encoded. Parse it:
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const speech = params.get("SpeechResult") || params.get("speechResult") || "";
    const base = process.env.PUBLIC_URL;

    // If nothing was heard, reprompt
    if (!speech) {
      const reprompt = `
<Response>
  <Say>Sorry, I didn't catch that.</Say>
  <Gather input="speech" action="${base}/api/bot" method="POST" language="en-US" timeout="4">
    <Say>Please go ahead.</Say>
  </Gather>
  <Redirect>${base}/api/voice</Redirect>
</Response>`.trim();
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(reprompt);
    }

    // Call OpenAI
    const text = await askOpenAI(speech, {
      business: process.env.BUSINESS_NAME || "BrightSmiles Dental",
      hours: process.env.HOURS_TEXT,
      special: process.env.NEW_PATIENT_SPECIAL,
      services: process.env.SERVICES,
      insurance: process.env.INSURANCE_TEXT,
    });

    // If caller asks for a human (keywords), transfer
    const needsHuman = (process.env.ESCALATION_KEYWORDS || "representative,person,manager,human,call back,call me").toLowerCase();
    const wantsHuman = needsHuman.split(",").some(k => speech.toLowerCase().includes(k.trim()));

    if (wantsHuman) {
      const forwardTo = process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER;
      const twiml = `
<Response>
  <Say>Connecting you now. Please hold.</Say>
  <Dial>${forwardTo}</Dial>
</Response>`.trim();
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(twiml);
    }

    // Normal reply + keep the conversation going
    const twiml = `
<Response>
  <Say>${text}</Say>
  <Gather input="speech" action="${base}/api/bot" method="POST" language="en-US" timeout="4">
    <Say>Anything else?</Say>
  </Gather>
  <Pause length="1"/>
  <Redirect>${base}/api/voice</Redirect>
</Response>`.trim();

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (err) {
    console.error("BOT ERROR:", err);
    const twiml = `
<Response>
  <Say>Sorry, I’m having trouble right now. I’ll transfer you.</Say>
  <Dial>${process.env.FORWARD_TO || process.env.TWILIO_PHONE_NUMBER}</Dial>
</Response>`.trim();
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  }
}
