const https = require("https");

const UPSTREAM = "https://api-open.data.gov.sg/v2/real-time/api/psi";

exports.handler = async (event) => {
  const date = event.queryStringParameters?.date || "";
  const url  = date ? `${UPSTREAM}?date=${date}` : UPSTREAM;

  const body = await new Promise((resolve, reject) => {
    https.get(
      url,
      { headers: { "X-Api-Key": process.env.DATAGOVSG_API_KEY || "" } },
      res => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve(data));
      }
    ).on("error", reject);
  });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body,
  };
};