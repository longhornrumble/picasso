/**
 * Bedrock Streaming Handler - Simplified Node.js Version
 * Works with Lambda Function URL RESPONSE_STREAM mode
 */

const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { BedrockAgentRuntimeClient, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Initialize AWS clients
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const bedrockAgent = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const s3 = new S3Client({ region: 'us-east-1' });

// In-memory cache
const KB_CACHE = {};
const CONFIG_CACHE = {};
const CACHE_TTL = 300000; // 5 minutes

function getCacheKey(text, prefix = '') {
  return `${prefix}:${crypto.createHash('md5').update(text).digest('hex')}`;
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.timestamp < CACHE_TTL);
}

async function loadConfig(tenantHash) {
  try {
    const cacheKey = `config:${tenantHash}`;
    if (CONFIG_CACHE[cacheKey] && isCacheValid(CONFIG_CACHE[cacheKey])) {
      return CONFIG_CACHE[cacheKey].data;
    }

    const bucket = process.env.CONFIG_BUCKET || 'myrecruiter-picasso';
    
    const mappingResponse = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: `mappings/${tenantHash}.json`
    }));
    
    const mapping = JSON.parse(await mappingResponse.Body.transformToString());
    
    if (mapping.tenant_id) {
      const configResponse = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: `tenants/${mapping.tenant_id}/config.json`
      }));
      
      const config = JSON.parse(await configResponse.Body.transformToString());
      CONFIG_CACHE[cacheKey] = { data: config, timestamp: Date.now() };
      return config;
    }
  } catch (error) {
    console.error('Config load error:', error.message);
  }
  
  return null;
}

async function retrieveKB(userInput, config) {
  const kbId = config?.aws?.knowledge_base_id;
  if (!kbId) return '';
  
  try {
    const cacheKey = getCacheKey(userInput, `kb:${kbId}`);
    if (KB_CACHE[cacheKey] && isCacheValid(KB_CACHE[cacheKey])) {
      return KB_CACHE[cacheKey].data;
    }
    
    const response = await bedrockAgent.send(new RetrieveCommand({
      knowledgeBaseId: kbId,
      retrievalQuery: { text: userInput },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: 3 }
      }
    }));
    
    const chunks = (response.retrievalResults || [])
      .map((r, i) => `**Context ${i+1}:**\n${r.content?.text || ''}`)
      .join('\n\n---\n\n');
    
    KB_CACHE[cacheKey] = { data: chunks, timestamp: Date.now() };
    return chunks;
    
  } catch (error) {
    console.error('KB error:', error.message);
    return '';
  }
}

function buildPrompt(userInput, kbContext, tone) {
  const parts = [tone || 'You are a helpful assistant.'];
  
  if (kbContext) {
    parts.push(
      '\n**Relevant Information:**',
      kbContext,
      '\n**Instructions:** Use the information above to answer accurately.'
    );
  }
  
  parts.push(`\n**User Question:** ${userInput}\n**Response:**`);
  return parts.join('\n');
}

/**
 * Main Lambda handler - returns SSE formatted response
 */
exports.handler = async (event, context) => {
  console.log('🌊 Node.js streaming handler invoked');
  
  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
      },
      body: ''
    };
  }
  
  const startTime = Date.now();
  const chunks = [];
  
  try {
    // Parse request
    const body = event.body ? JSON.parse(event.body) : {};
    const tenantHash = body.tenant_hash || '';
    const sessionId = body.session_id || 'default';
    const userInput = body.user_input || '';
    
    // Add prelude
    chunks.push(':ok\n\n');
    
    if (!tenantHash || !userInput) {
      const error = !tenantHash ? 'Missing tenant_hash' : 'Missing user_input';
      chunks.push(`data: {"type": "error", "error": "${error}"}\n\n`);
      chunks.push('data: [DONE]\n\n');
      
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        },
        body: chunks.join('')
      };
    }
    
    console.log(`Processing: ${tenantHash.substring(0,8)}... / ${sessionId.substring(0,12)}...`);
    
    // Load config
    let config = await loadConfig(tenantHash);
    if (!config) {
      config = {
        model_id: 'anthropic.claude-3-haiku-20240307-v1:0',
        streaming: { max_tokens: 1000, temperature: 0.2 },
        tone_prompt: 'You are a helpful assistant.'
      };
    }
    
    // Get KB context
    const kbContext = await retrieveKB(userInput, config);
    const prompt = buildPrompt(userInput, kbContext, config.tone_prompt);
    
    // Invoke Bedrock
    const response = await bedrock.send(new InvokeModelWithResponseStreamCommand({
      modelId: config.model_id || 'anthropic.claude-3-haiku-20240307-v1:0',
      accept: 'application/json',
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.streaming?.max_tokens || 1000,
        temperature: config.streaming?.temperature || 0.2
      })
    }));
    
    let firstTokenTime = null;
    let tokenCount = 0;
    
    // Process stream
    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        
        if (chunkData.type === 'content_block_delta') {
          const text = chunkData.delta?.text;
          if (text) {
            tokenCount++;
            
            if (!firstTokenTime) {
              firstTokenTime = Date.now() - startTime;
              chunks.push(`: x-first-token-ms=${firstTokenTime}\n\n`);
            }
            
            chunks.push(`data: {"type": "text", "content": ${JSON.stringify(text)}, "session_id": "${sessionId}"}\n\n`);
          }
        } else if (chunkData.type === 'message_stop') {
          break;
        }
      }
    }
    
    // Add completion
    const totalTime = Date.now() - startTime;
    chunks.push(`: x-total-tokens=${tokenCount}\n`);
    chunks.push(`: x-total-time-ms=${totalTime}\n`);
    chunks.push('data: [DONE]\n\n');
    
    console.log(`✅ Complete - ${tokenCount} tokens in ${totalTime}ms`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'X-Accel-Buffering': 'no'
      },
      body: chunks.join('')
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    
    chunks.push(`data: {"type": "error", "error": "${error.message}"}\n\n`);
    chunks.push('data: [DONE]\n\n');
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      },
      body: chunks.join('')
    };
  }
};