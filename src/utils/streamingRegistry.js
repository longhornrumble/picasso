/**
 * Imperative streaming registry that bypasses React state updates
 * Allows direct DOM updates without triggering React reconciliation
 */
class StreamingRegistry {
  constructor() {
    // messageId -> Set<{ onChunk: Function, onEnd?: Function }>
    this.listeners = new Map();
    // messageId -> accumulated content (string)
    this.activeStreams = new Map();
  }

  /**
   * Register a listener for a specific message
   * - Immediately replays the current buffer if stream already started
   * - Returns an unsubscribe function
   */
  subscribe(messageId, onChunk, onEnd) {
    if (!this.listeners.has(messageId)) {
      this.listeners.set(messageId, new Set());
    }
    const entry = { onChunk, onEnd };
    this.listeners.get(messageId).add(entry);

    // If streaming is already active, immediately send current content
    if (this.activeStreams.has(messageId) && typeof onChunk === 'function') {
      try {
        onChunk(this.activeStreams.get(messageId));
      } catch {}
    }

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(messageId);
      if (set) {
        set.delete(entry);
        if (set.size === 0) this.listeners.delete(messageId);
      }
    };
  }

  // Back-compat: previous signature subscribe(messageId, callback)
  // If callers pass only a single function, treat it as onChunk
  // (No code changes needed here; JS will simply set onEnd undefined.)

  /**
   * Start streaming for a message
   */
  startStream(messageId) {
    if (!this.activeStreams.has(messageId)) {
      this.activeStreams.set(messageId, '');
      console.log(`📝 StreamingRegistry: Started stream for ${messageId}`);
    }
  }

  /**
   * Append payload to the stream. Accepts either accumulated or delta payloads.
   * - If payload starts with current buffer, treat as accumulated.
   * - Otherwise treat as delta and concatenate.
   */
  append(messageId, payload) {
    if (payload == null) return;
    const incoming = String(payload);
    if (!this.activeStreams.has(messageId)) this.startStream(messageId);

    const current = this.activeStreams.get(messageId) || '';
    let next;
    if (incoming.length >= current.length && incoming.startsWith(current)) {
      // accumulated
      next = incoming;
    } else {
      // delta
      next = current + incoming;
    }

    this.activeStreams.set(messageId, next);
    const set = this.listeners.get(messageId);
    if (set && set.size) {
      set.forEach(({ onChunk }) => {
        if (typeof onChunk === 'function') {
          try { onChunk(next); } catch {}
        }
      });
    }
    console.log(`🌊 StreamingRegistry: Sent ${next.length} chars to ${set?.size || 0} listeners`);
  }

  /**
   * Back-compat adapter for older call sites that used (id, chunk, accumulated)
   */
  appendChunk(messageId, chunk, accumulated) {
    // Prefer accumulated if provided, else use chunk as delta
    const payload = (typeof accumulated === 'string' && accumulated.length >= 0)
      ? accumulated
      : (chunk != null ? String(chunk) : '');
    this.append(messageId, payload);
  }

  /**
   * End streaming for a message and notify listeners with final buffer
   */
  endStream(messageId) {
    const final = this.activeStreams.get(messageId) || '';
    const set = this.listeners.get(messageId);
    if (set && set.size) {
      set.forEach(({ onEnd }) => {
        if (typeof onEnd === 'function') {
          try { onEnd(final); } catch {}
        }
      });
    }
    this.activeStreams.delete(messageId);
    console.log(`✅ StreamingRegistry: Ended stream for ${messageId}`);
  }

  /** Stop all active streams, notifying onEnd for each */
  endAll() {
    Array.from(this.activeStreams.keys()).forEach((id) => this.endStream(id));
  }

  /** Is a message actively streaming? */
  isStreaming(messageId) {
    return this.activeStreams.has(messageId);
  }

  /** Get current content for a message */
  getCurrentContent(messageId) {
    return this.activeStreams.get(messageId) || '';
  }

  /** Alias for convenience */
  getAccumulated(messageId) {
    return this.getCurrentContent(messageId);
  }

  /** Introspection for tests/debug */
  debugInspect(messageId) {
    const buffer = this.activeStreams.get(messageId) || '';
    const set = this.listeners.get(messageId);
    return {
      bufferLength: buffer.length,
      hasListeners: !!set && set.size > 0,
      listenerCount: set ? set.size : 0,
    };
  }
}

// Global singleton instance
export const streamingRegistry = new StreamingRegistry();