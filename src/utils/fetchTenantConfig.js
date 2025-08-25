/**
 * Fetch the config JSON for a given tenant hash.
 * 
 * This function fetches from the production API using tenant hashes.
 * Matches the deployment infrastructure and hash-based system.
 * 
 * @param {string} tenantHash - The hash of the tenant (e.g., my87674d777bf9)
 * @returns {Promise<Object>} - Resolves to the config JSON object
 * @throws {Error} - If the fetch fails or config is invalid
 */

import { config as environmentConfig } from '../config/environment';

export async function fetchTenantConfig(tenantHash) {
  if (!tenantHash) {
    throw new Error("fetchTenantConfig: tenantHash is required");
  }

  // PRODUCTION: Use the correct hash-based API endpoint from environment config
  const url = environmentConfig.getConfigUrl(tenantHash);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const config = await response.json();

    // Validate structure before returning
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config structure received.");
    }

    // Ensure required fields exist
    if (!config.tenant_id && !config.tenant_hash) {
      config.tenant_hash = tenantHash;
    }

    return config;
  } catch (error) {
    console.error(`❌ Failed to fetch config for tenant '${tenantHash}':`, error);
    throw error;
  }
}