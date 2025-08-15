// api/bot.js
const FORWARD_TO = process.env.FORWARD_TO || "+13212038087";        // your cell
const TWILIO_CALLER_ID = process.env.TWILIO_PHONE_NUMBER || "";      // your Twilio #
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function twiml(s) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${s}`;
}

function sayAndReprompt(message) {
  return twiml(`
<Response>
  <Say>${message}</Say>
  <Gather input="speech" action="/api/bot" method="POST" language="en-US" speechTimeout="auto">
    <Say>Anything else I can help with?</Say>
  </Gather>
  <Redirect>/api/voice</Redirect>
</Response>`.trim());
}

function transferToHuman(reason = "Transferring you now.") {
  const callerIdAttr = TWILIO_CALLER_ID ? ` callerId="${TWILIO_CALLER_ID}"` : "";
  return twiml(`
<Response>
  <Say>${reason}</Say>
  <Dial${callerIdAttr}>
    <Number>${FORWARD_TO}</Number>
  </Dial>
</Response>`.trim());
}

export default async function handler(req, res) {
  try {
    // Twilio posts form-encoded data
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    const speech = (params.get("SpeechResult") || "").trim();
    const numFailures = parseInt(params.get("numFailures") || "0", 10);

    // If nothing heard, reprompt or escalate if repeated
    if (!speech) {
      if (numFailures >= 1) {
        res.setHeader("Content-Type", "text/xml");
        return res.status(200).send(transferToHuman("Let me connect you to our team."));
      }
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(sayAndReprompt("Sorry, I didn’t hear you."));
    }

    // Escalation keywords (caller asks for a person)
    const escalate = /representative|human|person|manager|receptionist|call back/i.test(speech);
    if (escalate) {
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(transferToHuman("Sure, I’ll connect you now."));
    }

    // Call OpenAI with a strict timeout so we don't hit Vercel's limit
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s budget for OpenAI
    const business = process.env.BUSINESS_NAME || "BrightSmiles Dental";
    const hours = process.env.HOURS_TEXT || "We’re open Monday through Friday, 8 AM to 5 PM.";
    const ins = process.env.INSURANCE_TEXT || "We accept many PPO plans. Please bring your insurance card so we can verify.";

    const sys = [
      `You are a concise, friendly dental office phone assistant for ${business}.`,
      `If asked about hours: ${hours}`,
      `If asked about insurance: ${ins}`,
      `Allowed actions: answer succinctly (1–2 sentences).`,
      `If the user tries to book an appointment, gather name and phone, then say you'll have the office call back.`,
      `If user explicitly asks for a human or if you are unsure twice, ask to transfer.`,
      `Never say you are an AI model; you are the office assistant.`
    ].join(" ");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 120,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: speech }
        ]
      }),
      signal: controller.signal
    }).catch((e) => {
      // network/abort also lands here
      return { ok: false, statusText: e.name || "fetch_error" };
    });
    clearTimeout(timer);

    if (!resp || !resp.ok) {
      // OpenAI failed or timed out — graceful transfer after one apology
      res.setHeader("Content-Type", "text/xml");
      if (numFailures >= 1) {
        return res.status(200).send(transferToHuman("Sorry, I’m having trouble. I’ll connect you now."));
      }
      return res.status(200).send(sayAndReprompt("Sorry, I had trouble answering that."));
    }

    const data = await resp.json();
    const answer = (data?.choices?.[0]?.message?.content || "").trim() || "Here’s the information you requested.";

    // Normal reply + keep the conversation open
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(sayAndReprompt(answer));

  } catch (err) {
    // Any unexpected error -> clean transfer
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(transferToHuman("Sorry, an application error occurred. I’ll connect you now."));
  }
}
