// Placeholder — real handler lands via lambda-repo CI deploy.
// Track 1 S6: Reminder_Scheduler (CJS, nodejs20.x, handler index.handler).
exports.handler = async (event) => {
  console.log("placeholder: real code not yet deployed", JSON.stringify(event));
  return { statusCode: 200 };
};
