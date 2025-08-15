export default async function handler(req, res) {
  const base = process.env.PUBLIC_URL; // e.g. https://dental-voice-demo.vercel.app
  const business = process.env.BUSINESS_NAME || "BrightSmiles Dental";
  const welcome = `Thanks for calling ${business}. I’m your virtual assistant. 
  You can say things like: schedule an appointment, what are your hours, or 
  do you take my insurance?`;

  const twiml = `
<Response>
  <Say>${welcome}</Say>
  <Gather input="speech" action="${base}/api/bot" method="POST" language="en-US" timeout="4">
    <Say>How can I help?</Say>
  </Gather>
  <Say>Sorry, I didn't hear you. Let me try again.</Say>
  <Redirect>${base}/api/voice</Redirect>
</Response>`.trim();

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}
