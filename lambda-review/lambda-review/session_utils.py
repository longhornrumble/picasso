import uuid
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def extract_session_data(event):
    session_attrs = event.get("sessionState", {}).get("sessionAttributes", {}) or {}
    session_id = event.get("sessionId") or str(uuid.uuid4())
    tenant_id = session_attrs.get("tenant_id")

    logger.info(f"[{tenant_id}] 🧾 Extracted session data: session_id={session_id}, topic={session_attrs.get('current_topic', '')}")
    
    return {
        "tenant_id": tenant_id,
        "prompt_index": int(session_attrs.get("prompt_variant_index", 0)),
        "topic": session_attrs.get("current_topic", ""),
        "session_id": session_id,
        "raw": session_attrs
    }

def build_session_attributes(tenant_id, prompt_index=0, topic=""):
    logger.info(f"[{tenant_id}] 🧩 Building session attributes: prompt_index={prompt_index}, topic={topic}")
    return {
        "tenant_id": tenant_id,
        "prompt_variant_index": str(prompt_index),
        "current_topic": topic
    }