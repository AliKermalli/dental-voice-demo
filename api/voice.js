export default async function handler(req, res) {
  // TwiML response that greets and gathers speech
  const business = process.env.BUSINESS_NAME || "BrightSmiles Dental";
  const welcome = `Thanks for calling ${business}. 
    You can say things like: schedule an appointment, what are your hours, do you take my insurance, or talk to a person.`;

  const twiml = `
    <Response>
      <Gather input="speech" action="/api/bot" method="POST" language="en-US" speechTimeout="auto">
        <Say>${welcome}</Say>
      </Gather>
      <Say>Sorry, I didn't hear you. Let me try again.</Say>
      <Redirect>/api/voice</Redirect>
    </Response>`.trim();

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml);
}
