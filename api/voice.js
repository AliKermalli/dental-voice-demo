// /api/voice.js
export default async function handler(req, res) {
  // Basic business context (optional, set in Vercel → Settings → Environment Variables)
  const business = process.env.BUSINESS_NAME || "BrightSmiles Dental";
  const hours =
    process.env.HOURS_TEXT ||
    "We are open Monday through Friday, 8 AM to 5 PM.";
  const special =
    process.env.NEW_PATIENT_SPECIAL ||
    "Our new‑patient special is $129 for exam, x‑rays, and basic cleaning.";

  const welcome = `Thanks for calling ${business}. ${hours} ${special} I can help schedule an appointment, check insurance, share pricing, or take a message. How can I help you today?`;

  // TwiML with improved speech recognition
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech"
          action="/api/bot"
          method="POST"
          language="en-US"
          speechTimeout="auto"
          hints="appointment,hours,insurance,new patient,cleaning,whitening,root canal,pricing,location,representative,call back,phone number,email">
    <Say voice="alice">${escapeXml(welcome)}</Say>
  </Gather>
  <Say voice="alice">Sorry, I didn't hear you. Let me try again.</Say>
  <Redirect method="POST">/api/voice</Redirect>
</Response>`.trim();

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}

// Small helper to keep TwiML valid if your text contains characters like & or <
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
