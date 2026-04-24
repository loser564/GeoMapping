const AWS   = require("aws-sdk");
const s3    = new AWS.S3();
const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key    = decodeURIComponent(event.Records[0].s3.object.key);

  const obj  = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const rows = parseCSV(obj.Body.toString());           // your parseCSV logic

  const writes = rows.map(row => ({
    PutRequest: {
      Item: {
        patient_id:     row.patient_id,
        responded_date: row.responded_date,
        symptoms_score: parseInt(row.symptoms_score),
        missed_medication: parseInt(row.missed_medication) || 0,
        ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1yr TTL
      },
    },
  }));

  // DynamoDB batch write (max 25 per call)
  for (let i = 0; i < writes.length; i += 25) {
    await dynamo.batchWrite({
      RequestItems: { PatientScores: writes.slice(i, i + 25) },
    }).promise();
  }

  return { statusCode: 200 };
};