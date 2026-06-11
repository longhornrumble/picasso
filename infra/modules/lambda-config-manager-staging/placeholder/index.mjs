// Placeholder -- real handler is deployed from Lambdas/lambda/Picasso_Config_Manager
// (ESM, nodejs22.x, handler index.handler).
export const handler = async (event) => {
  console.log("placeholder: real code not yet deployed", JSON.stringify(event));
  return { statusCode: 503, body: JSON.stringify({ error: "config-api staging twin: code not deployed yet" }) };
};
