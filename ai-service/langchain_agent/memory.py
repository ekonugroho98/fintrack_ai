from langchain.memory import ConversationBufferMemory
from langchain.schema import BaseMemory
from langchain.schema import SystemMessage, HumanMessage, AIMessage
import redis
import json
from typing import Dict, List, Any, Optional

class RedisConversationMemory(BaseMemory):
    """Memory implementation that stores conversation history in Redis"""
    
    def __init__(self, phone_number: str):
        """Initialize memory with phone number"""
        self.phone_number = phone_number
        self._redis = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self._chat_memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )

    @property
    def redis(self) -> redis.Redis:
        """Get Redis connection"""
        if self._redis is None:
            self._redis = redis.Redis(host='localhost', port=6379, decode_responses=True)
        return self._redis

    @property
    def chat_memory(self) -> ConversationBufferMemory:
        """Get chat memory instance"""
        if self._chat_memory is None:
            self._chat_memory = ConversationBufferMemory(
                memory_key="chat_history",
                return_messages=True
            )
        return self._chat_memory

    def load_memory_variables(self, inputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Load memory variables from Redis"""
        history = self.redis.lrange(f"memory:{self.phone_number}", 0, -1)
        messages = [json.loads(item) for item in history]
        
        # Convert messages to LangChain message types
        for msg in messages:
            if msg["role"] == "system":
                self.chat_memory.chat_memory.add_message(SystemMessage(content=msg["content"]))
            elif msg["role"] == "human":
                self.chat_memory.chat_memory.add_message(HumanMessage(content=msg["content"]))
            elif msg["role"] == "ai":
                self.chat_memory.chat_memory.add_message(AIMessage(content=msg["content"]))
        
        return self.chat_memory.load_memory_variables(inputs)

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Save context to Redis"""
        # Save to Redis
        if "input" in inputs:
            self.redis.rpush(f"memory:{self.phone_number}", json.dumps({
                "role": "human",
                "content": inputs["input"]
            }))
        
        if "output" in outputs:
            self.redis.rpush(f"memory:{self.phone_number}", json.dumps({
                "role": "ai",
                "content": outputs["output"]
            }))
        
        # Also save to chat_memory for compatibility
        self.chat_memory.save_context(inputs, outputs)
        
        # Set TTL
        self.redis.expire(f"memory:{self.phone_number}", 86400)  # 1 hari TTL

    def clear(self) -> None:
        """Clear memory"""
        self.redis.delete(f"memory:{self.phone_number}")
        self.chat_memory.clear()

    @property
    def memory_variables(self) -> List[str]:
        """Return memory variables"""
        return self.chat_memory.memory_variables

# Untuk fallback atau pengembangan cepat
def get_memory(mode="buffer", phone_number=None):
    if mode == "redis" and phone_number:
        return RedisConversationMemory(phone_number=phone_number)
    else:
        return ConversationBufferMemory(memory_key="chat_history", return_messages=True)
