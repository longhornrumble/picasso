/**
 * Bedrock Streaming Handler - True Lambda Response Streaming
 * Uses awslambda.streamifyResponse for real SSE streaming
 * No JWT required - uses simple tenant_hash/session_id
 */

const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { BedrockAgentRuntimeClient, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Note: streamifyResponse is provided by Lambda runtime, not an npm package
const streamifyResponse = require('aws-lambda/streamify-response');

// Initialize AWS clients
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });
const bedrockAgent = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const s3 = new S3Client({ region: 'us-east-1' });

// In-memory cache
const KB_CACHE = {};
const CONFIG_CACHE = {};
const CACHE_TTL = 300000; // 5 minutes

// Helper functions
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
      console.log(`✅ Config cache hit for ${tenantHash.substring(0, 8)}...`);
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
      console.log(`✅ Config loaded from S3 for ${tenantHash.substring(0, 8)}...`);
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
      console.log(`✅ KB cache hit`);
      return KB_CACHE[cacheKey].data;
    }
    
    console.log(`📚 Retrieving from KB: ${kbId}`);
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
 * Main streaming handler with true Lambda response streaming
 */
exports.handler = streamifyResponse(async (event, responseStream) => {
  console.log('🌊 True streaming handler invoked');
  
  // TextEncoder for writing strings to stream
  const te = new TextEncoder();
  const write = (s) => responseStream.write(te.encode(s));
  
  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    responseStream.setContentType('text/plain');
    responseStream.setHeader('Access-Control-Allow-Origin', '*');
    responseStream.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseStream.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    responseStream.end();
    return;
  }
  
  // Set SSE headers
  responseStream.setContentType('text/event-stream');
  responseStream.setHeader('Cache-Control', 'no-cache');
  responseStream.setHeader('Connection', 'keep-alive');
  responseStream.setHeader('Access-Control-Allow-Origin', '*');
  responseStream.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  responseStream.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  responseStream.setHeader('X-Accel-Buffering', 'no');
  
  // Send prelude to open the pipe immediately
  write(':ok\n\n');
  
  const startTime = Date.now();
  let heartbeatInterval;
  
  try {
    // Parse request
    const body = event.body ? JSON.parse(event.body) : {};
    const tenantHash = body.tenant_hash || '';
    const sessionId = body.session_id || 'default';
    const userInput = body.user_input || '';
    
    if (!tenantHash || !userInput) {
      const error = !tenantHash ? 'Missing tenant_hash' : 'Missing user_input';
      write(`data: {"type": "error", "error": "${error}"}\n\n`);
      write('data: [DONE]\n\n');
      responseStream.end();
      return;
    }
    
    console.log(`📝 Processing: ${tenantHash.substring(0,8)}... / ${sessionId.substring(0,12)}...`);
    
    // Start heartbeat to keep connection alive
    heartbeatInterval = setInterval(() => {
      write(':hb\n\n');
      console.log('💓 Heartbeat sent');
    }, 10000);
    
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
    
    // Prepare Bedrock request
    const modelId = config.model_id || 'anthropic.claude-3-haiku-20240307-v1:0';
    console.log(`🚀 Invoking Bedrock with model: ${modelId}`);
    
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      accept: 'application/json',
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.streaming?.max_tokens || 1000,
        temperature: config.streaming?.temperature || 0.2
      })
    });
    
    const response = await bedrock.send(command);
    
    let firstTokenTime = null;
    let tokenCount = 0;
    
    // Stream the response - NO BUFFERING!
    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        
        if (chunkData.type === 'content_block_delta') {
          const delta = chunkData.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            tokenCount++;
            
            // Send first token timing as SSE comment
            if (!firstTokenTime) {
              firstTokenTime = Date.now() - startTime;
              write(`: x-first-token-ms=${firstTokenTime}\n\n`);
              console.log(`⚡ First token in ${firstTokenTime}ms`);
            }
            
            // Write chunk immediately - NO BUFFERING!
            const sseData = JSON.stringify({
              type: 'text',
              content: delta.text,
              session_id: sessionId
            });
            write(`data: ${sseData}\n\n`);
          }
        } else if (chunkData.type === 'message_stop') {
          console.log('✅ Bedrock stream complete');
          break;
        }
      }
    }
    
    // Send completion metadata
    const totalTime = Date.now() - startTime;
    write(`: x-total-tokens=${tokenCount}\n`);
    write(`: x-total-time-ms=${totalTime}\n`);
    console.log(`✅ Complete - ${tokenCount} tokens in ${totalTime}ms`);
    
  } catch (error) {
    console.error('❌ Stream error:', error);
    write(`data: {"type": "error", "error": "${error.message}"}\n\n`);
  } finally {
    // Clean up
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    // Send completion marker
    write('data: [DONE]\n\n');
    
    // End the stream
    responseStream.end();
  }
});

/**
 * Fallback for environments without streaming support
 */
exports.fallbackHandler = async (event, context) => {
  console.log('📡 Fallback handler (no streaming support)');
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    },
    body: ':ok\n\ndata: {"type": "error", "error": "Streaming not available"}\n\ndata: [DONE]\n\n'
  };
};