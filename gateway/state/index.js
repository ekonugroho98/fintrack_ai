import NodeCache from 'node-cache';
import { logger } from '../utils/logger.js';

class StateManager {
  constructor() {
    this.conversationState = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 600 // Check every 10 minutes
    });
  }

  getState(userId) {
    const state = this.conversationState.get(userId);
    if (!state) {
      const newState = {
        context: {},
        lastInteraction: Date.now(),
        messageCount: 0,
        flow: null
      };
      this.conversationState.set(userId, newState);
      return newState;
    }
    return state;
  }

  updateState(userId, updates) {
    const currentState = this.getState(userId);
    const newState = {
      ...currentState,
      ...updates,
      lastInteraction: Date.now()
    };
    this.conversationState.set(userId, newState);
    return newState;
  }

  setFlow(userId, flow) {
    return this.updateState(userId, { flow });
  }

  incrementMessageCount(userId) {
    const state = this.getState(userId);
    return this.updateState(userId, {
      messageCount: (state.messageCount || 0) + 1
    });
  }

  clearState(userId) {
    this.conversationState.del(userId);
  }

  // Cleanup old states
  cleanup() {
    const now = Date.now();
    const keys = this.conversationState.keys();
    
    keys.forEach(key => {
      const state = this.conversationState.get(key);
      if (now - state.lastInteraction > 3600000) { // 1 hour
        this.clearState(key);
        logger.info({
          event: 'state_cleaned',
          userId: key
        });
      }
    });
  }
}

export const stateManager = new StateManager();

// Run cleanup every hour
setInterval(() => {
  stateManager.cleanup();
}, 3600000); 