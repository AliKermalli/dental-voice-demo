// api/voice.js
export default async function handler(req, res) {
  const business = process.env.BUSINESS_NAME || "BrightSmiles Dental";
  const welcome = `Thanks for calling ${business}. I’m your virtual assistant. How can I help you today?`;

  const twiml = `
<Response>
  <Gather input="speech" action="/api/bot" method="POST" language="en-US" speechTimeout="auto" profanityFilter="false">
    <Say>${welcome}</Say>
  </Gather>
  <Say>Sorry, I didn't catch that. Let me try again.</Say>
  <Redirect>/api/voice</Redirect>
</Response>`.trim();

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}
