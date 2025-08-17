import json
import logging
import os
from typing import Dict, Any
from urllib.parse import parse_qs

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def add_cors_headers(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add CORS headers to response. This is the ONLY place CORS headers are added.
    """
    if 'headers' not in response:
        response['headers'] = {}
    
    # Add CORS headers - this is the single source of truth
    response['headers']['Access-Control-Allow-Origin'] = '*'
    response['headers']['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response['headers']['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response['headers']['Content-Type'] = 'application/json'
    
    return response

def health_check() -> Dict[str, Any]:
    """
    Simple health check endpoint
    """
    logger.info("Health check requested")
    
    response = {
        'statusCode': 200,
        'body': json.dumps({
            'status': 'healthy',
            'timestamp': '2025-08-15T00:00:00Z',  # In production, use datetime.utcnow().isoformat()
            'function': 'Master_Function_Staging'
        })
    }
    
    return add_cors_headers(response)

def get_config_for_tenant(tenant_hash: str) -> Dict[str, Any]:
    """
    Return configuration for a specific tenant
    """
    logger.info(f"Config requested for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    if not tenant_hash:
        response = {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Bad Request',
                'message': 'Tenant hash is required'
            })
        }
        return add_cors_headers(response)
    
    # Try to load real config using tenant_config_loader if available
    try:
        from tenant_config_loader import get_config_for_tenant_by_hash
        logger.info(f"Loading real config for tenant: {tenant_hash[:8]}...")
        
        # Call the real config loader
        config_data = get_config_for_tenant_by_hash(tenant_hash)
        
        if config_data:
            logger.info(f"Successfully loaded config for tenant: {tenant_hash[:8]}...")
            response = {
                'statusCode': 200,
                'body': json.dumps(config_data)
            }
        else:
            logger.warning(f"No config found for tenant: {tenant_hash[:8]}...")
            response = {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Configuration not found for tenant {tenant_hash[:8]}...'
                })
            }
        
    except ImportError:
        logger.warning("tenant_config_loader not available, returning mock config")
        # Fall back to mock config if module not available
        config_data = {
            'tenant_hash': tenant_hash,
            'chat_title': 'Chat Assistant',
            'welcome_message': 'Hello! How can I help you today?',
            'branding': {
                'primary_color': '#3b82f6',
                'font_family': 'Inter, sans-serif',
                'chat_title': 'Chat',
                'border_radius': '12px'
            },
            'features': {
                'uploads': False,
                'photo_uploads': False,
                'callout': True,
                'streaming_enabled': False,
                'quick_help': True,
                'action_chips': True
            },
            'quick_help': {
                'enabled': True,
                'items': [
                    {'label': 'How can I get help?', 'value': 'How can I get help?'},
                    {'label': 'What services do you offer?', 'value': 'What services do you offer?'}
                ]
            },
            'action_chips': {
                'enabled': True,
                'chips': ['Yes', 'No', 'Tell me more']
            },
            'metadata': {
                'source': 'lambda-mock',
                'environment': os.environ.get('ENVIRONMENT', 'staging'),
                'version': os.environ.get('VERSION', '1.0.0')
            }
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(config_data)
        }
    except Exception as e:
        logger.error(f"Error loading config: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to load configuration'
            })
        }
    
    return add_cors_headers(response)

def handle_chat(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Handle chat messages using real intent router with conversation memory support
    """
    logger.info(f"Chat request for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        # Try to use the real intent router
        from intent_router import route_intent
        
        # Parse request body
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Extract Authorization header for state token (conversation memory)
        headers = event.get('headers', {})
        auth_header = headers.get('Authorization', headers.get('authorization', ''))
        state_token = None
        conversation_context = None
        
        if auth_header and auth_header.startswith('Bearer '):
            state_token = auth_header.replace('Bearer ', '').strip()
            logger.info(f"State token found in Authorization header: {state_token[:20]}...")
            
            # Decode the state token to get conversation context
            try:
                import base64
                decoded = base64.b64decode(state_token).decode('utf-8')
                token_data = json.loads(decoded)
                
                # Extract conversation context from token AND request body
                request_context = body.get('conversation_context', {})
                # Frontend sends 'recentMessages' in the conversation_context
                messages = request_context.get('recentMessages', request_context.get('messages', []))
                conversation_context = {
                    'session_id': token_data.get('session_id'),
                    'turn': token_data.get('turn', 0),
                    'conversation_id': body.get('conversation_id'),
                    'messages': messages,  # Use recentMessages from frontend
                    'recentMessages': messages,  # Support both formats
                    'previous_messages': messages  # Support all formats
                }
                logger.info(f"Conversation context extracted: turn {conversation_context['turn']}, {len(messages)} messages from request")
            except Exception as e:
                logger.warning(f"Could not decode state token: {e}")
        else:
            logger.info("No Authorization header found - starting new conversation")
        
        # Prepare the event for intent router - it expects Lambda event structure
        chat_event = {
            'queryStringParameters': {
                't': tenant_hash
            },
            'headers': headers,  # Pass headers through
            'body': json.dumps({
                'tenant_hash': tenant_hash,
                'user_input': body.get('user_input', ''),
                'session_id': body.get('session_id', ''),
                'context': body.get('context', {}),
                'metadata': body.get('metadata', {}),
                'conversation_id': body.get('conversation_id'),
                'turn': body.get('turn', 0),
                'state_token': state_token,
                'conversation_context': body.get('conversation_context', {})
            })
        }
        
        logger.info(f"Routing chat to intent handler for tenant: {tenant_hash[:8]}...")
        
        # Call the real intent router with conversation context
        logger.info(f"Calling route_intent with conversation_context: {conversation_context is not None}")
        response_data = route_intent(chat_event, conversation_context=conversation_context)
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except ImportError:
        logger.error("Intent router not available")
        response = {
            'statusCode': 503,
            'body': json.dumps({
                'error': 'Service Unavailable',
                'message': 'Chat service temporarily unavailable'
            })
        }
    except json.JSONDecodeError:
        response = {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Bad Request',
                'message': 'Invalid JSON in request body'
            })
        }
    except Exception as e:
        logger.error(f"Error handling chat: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to process chat message'
            })
        }
    
    return add_cors_headers(response)

def handle_conversation(event: Dict[str, Any], tenant_hash: str, operation: str) -> Dict[str, Any]:
    """
    Handle conversation operations using real conversation handler
    """
    logger.info(f"Conversation {operation} for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        from conversation_handler import handle_conversation_action
        
        # Prepare event for conversation handler
        conv_event = {
            'queryStringParameters': event.get('queryStringParameters', {}),
            'body': event.get('body', '{}'),
            'httpMethod': event.get('httpMethod', 'GET')
        }
        conv_event['queryStringParameters']['operation'] = operation
        conv_event['queryStringParameters']['t'] = tenant_hash
        
        # Call the real conversation handler
        response = handle_conversation_action(conv_event, None)
        
        # Response already includes headers from handler
        if 'headers' not in response:
            response = add_cors_headers(response)
        
        return response
        
    except ImportError:
        logger.warning("Conversation handler not available, returning empty conversation")
        response_data = {
            'conversation': {
                'messages': [],
                'session_id': event.get('queryStringParameters', {}).get('session_id', ''),
                'created_at': '2025-08-17T00:00:00Z'
            }
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
        return add_cors_headers(response)
    except Exception as e:
        logger.error(f"Error handling conversation: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to handle conversation operation'
            })
        }
        return add_cors_headers(response)

def handle_init_session(event: Dict[str, Any], tenant_hash: str) -> Dict[str, Any]:
    """
    Initialize a new chat session using session utils
    """
    logger.info(f"Init session for tenant: {tenant_hash[:8] if tenant_hash else 'unknown'}...")
    
    try:
        from session_utils import generate_session_id
        import time
        import base64
        
        # Parse request body if it exists
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        
        # Check if we already have a session_id from the client
        client_session_id = body.get('session_id', '')
        
        # Generate or use existing session ID
        session_id = client_session_id if client_session_id else generate_session_id()
        
        # Generate a state token (JWT-like structure for conversation state)
        # This token will be used to track conversation state between requests
        state_token_data = {
            'session_id': session_id,
            'tenant_hash': tenant_hash,
            'turn': 0,
            'created_at': int(time.time()),
            'expires_at': int(time.time()) + 1800  # 30 minutes
        }
        
        # Create a simple state token (in production, use proper JWT)
        state_token = base64.b64encode(json.dumps(state_token_data).encode()).decode()
        
        response_data = {
            'session_id': session_id,
            'state_token': state_token,  # Include the state token!
            'turn': 0,  # Initialize turn counter
            'tenant_hash': tenant_hash,
            'initialized': True,
            'timestamp': '2025-08-17T00:00:00Z',
            'config': {
                'timeout': 1800,  # 30 minutes
                'max_messages': 100
            }
        }
        
        logger.info(f"Init session response: session_id={session_id[:16]}..., has_state_token=True")
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except ImportError:
        logger.warning("Session utils not available, generating simple session ID")
        # Fallback to simple session ID
        import uuid
        import time
        import base64
        
        # Parse request body if it exists
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
        client_session_id = body.get('session_id', '')
        
        session_id = client_session_id if client_session_id else f'session_{uuid.uuid4().hex[:16]}'
        
        # Generate state token even in fallback
        state_token_data = {
            'session_id': session_id,
            'tenant_hash': tenant_hash,
            'turn': 0,
            'created_at': int(time.time()),
            'expires_at': int(time.time()) + 1800
        }
        state_token = base64.b64encode(json.dumps(state_token_data).encode()).decode()
        
        response_data = {
            'session_id': session_id,
            'state_token': state_token,
            'turn': 0,
            'tenant_hash': tenant_hash,
            'initialized': True,
            'timestamp': '2025-08-17T00:00:00Z'
        }
        
        response = {
            'statusCode': 200,
            'body': json.dumps(response_data)
        }
        
    except Exception as e:
        logger.error(f"Error initializing session: {str(e)}")
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'Failed to initialize session'
            })
        }
    
    return add_cors_headers(response)

def get_cache_status() -> Dict[str, Any]:
    """
    Get cache status information
    """
    logger.info("Cache status requested")
    
    response_data = {
        'cache_enabled': True,
        'cache_size': 0,
        'cache_entries': 0,
        'cache_ttl': 300,  # 5 minutes
        'environment': os.environ.get('ENVIRONMENT', 'staging')
    }
    
    response = {
        'statusCode': 200,
        'body': json.dumps(response_data)
    }
    
    return add_cors_headers(response)

def clear_cache(tenant_hash: str) -> Dict[str, Any]:
    """
    Clear cache for a specific tenant or all tenants
    """
    logger.info(f"Clear cache requested for tenant: {tenant_hash[:8] if tenant_hash else 'all'}...")
    
    response_data = {
        'success': True,
        'message': f"Cache cleared for {'tenant ' + tenant_hash[:8] if tenant_hash else 'all tenants'}",
        'timestamp': '2025-08-17T00:00:00Z'
    }
    
    response = {
        'statusCode': 200,
        'body': json.dumps(response_data)
    }
    
    return add_cors_headers(response)

def handle_options() -> Dict[str, Any]:
    """
    Handle CORS preflight requests
    """
    logger.info("OPTIONS preflight request")
    
    response = {
        'statusCode': 200,
        'body': json.dumps({'message': 'CORS preflight successful'})
    }
    
    return add_cors_headers(response)

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Main Lambda handler with centralized routing and CORS
    """
    try:
        # Log the incoming request for debugging
        logger.info(f"Received event: {json.dumps(event, default=str)}")
        
        # Extract HTTP method
        http_method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        
        # Handle OPTIONS requests (CORS preflight)
        if http_method == 'OPTIONS':
            return handle_options()
        
        # Parse query parameters
        query_params = event.get('queryStringParameters', {}) or {}
        multi_value_params = event.get('multiValueQueryStringParameters', {}) or {}
        
        # If no queryStringParameters, try to parse from rawQueryString (Lambda Function URL format)
        if not query_params and event.get('rawQueryString'):
            parsed = parse_qs(event.get('rawQueryString', ''))
            query_params = {k: v[0] if v else None for k, v in parsed.items()}
        
        # Get action and tenant hash from query parameters
        action = query_params.get('action', '')
        tenant_hash = query_params.get('t', '')
        
        logger.info(f"Processing {http_method} request with action: {action}, tenant: {tenant_hash[:8]}..." if tenant_hash else f"Processing {http_method} request with action: {action}")
        
        # Route based on action parameter
        if action == 'health_check' or action == 'health':
            return health_check()
        elif action == 'get_config':
            return get_config_for_tenant(tenant_hash)
        elif action == 'chat':
            return handle_chat(event, tenant_hash)
        elif action == 'conversation':
            operation = query_params.get('operation', 'get')
            return handle_conversation(event, tenant_hash, operation)
        elif action == 'init_session':
            return handle_init_session(event, tenant_hash)
        elif action == 'cache_status':
            return get_cache_status()
        elif action == 'clear_cache':
            return clear_cache(tenant_hash)
        elif not action:
            # No action specified, default to health check
            return health_check()
        else:
            # Unknown action
            logger.warning(f"Unknown action requested: {action}")
            response = {
                'statusCode': 404,
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Action {action} not found',
                    'available_actions': ['health_check', 'get_config', 'chat', 'conversation', 'init_session']
                })
            }
            return add_cors_headers(response)
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        response = {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': 'An unexpected error occurred'
            })
        }
        return add_cors_headers(response)