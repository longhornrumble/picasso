// Placeholder — real handler lands via lambda-repo CI deploy.
// Track 1 S6: Scheduled_Message_Sender (ESM, nodejs20.x, handler index.handler).
export const handler = async (event) => {
  console.log("placeholder: real code not yet deployed", JSON.stringify(event));
  return { statusCode: 200 };
};
