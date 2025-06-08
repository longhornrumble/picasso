/**
 * Fetch the config JSON for a given tenant ID.
 * 
 * This function fetches from the S3 bucket where configs are stored.
 * 
 * @param {string} tenantId - The ID of the tenant (e.g., FOS402334)
 * @returns {Promise<Object>} - Resolves to the config JSON object
 * @throws {Error} - If the fetch fails or config is invalid
 */

export async function fetchTenantConfig(tenantId) {
  if (!tenantId) {
    throw new Error("fetchTenantConfig: tenantId is required");
  }

  // Use your Lambda API for config instead of S3
  const url = `https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/primary/Master_Function/tenants/${tenantId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load config for tenant '${tenantId}': ${response.statusText}`);
  }

  const config = await response.json();

  // Optional: validate structure here before returning
  if (!config || typeof config !== "object" || !config.tenant_id) {
    throw new Error("Invalid config structure received.");
  }

  return config;
}