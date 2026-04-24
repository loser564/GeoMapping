/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */// csvReader/index.js
// Reads CSV files from S3 and returns them to the frontend.
// Triggered via API Gateway GET /data/{file}
//
// Supported files (set in S3_FILE_MAP):
//   /data/demographics    -> demographics_filled.csv
//   /data/scores          -> symptom_scores.csv
//   /data/env-history     -> env_history.csv

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-1" });

const BUCKET = process.env.S3_BUCKET;

// Map route param -> S3 key
// Update filenames here to match what you upload to S3
const S3_FILE_MAP = {
  "demographics": process.env.DEMOGRAPHICS_FILE,
  "scores":       process.env.SCORES_FILE,
  "env-history":  process.env.ENV_HISTORY_FILE
};

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end",  () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });
}

exports.handler = async (event) => {
  const file = event.pathParameters?.file;
  const s3Key = S3_FILE_MAP[file];

  if (!s3Key) {
    return {
      statusCode: 404,
      headers: corsHeaders(),
      body: JSON.stringify({ error: `Unknown file: ${file}. Valid options: ${Object.keys(S3_FILE_MAP).join(", ")}` }),
    };
  }

  if (!BUCKET) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "S3_BUCKET environment variable not set." }),
    };
  }

  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    const response = await s3.send(command);
    const csvText = await streamToString(response.Body);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/csv",
        "Cache-Control": "max-age=300", // cache 5 min in browser
      },
      body: csvText,
    };
  } catch (err) {
    if (err.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: `File not found in S3: ${s3Key}` }),
      };
    }
    console.error("S3 read error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}