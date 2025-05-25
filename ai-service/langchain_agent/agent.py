from langchain.agents import initialize_agent, Tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import SystemMessage
from langchain_agent.tools import get_financial_tools
from langchain_agent.memory import get_memory
from langchain_agent.prompt import get_system_prompt
from langchain_agent.config import USE_REDIS_MEMORY
from config.config import (
    GEMINI_API_KEYS,
    GEMINI_MODEL,
    GEMINI_TEMPERATURE,
    GEMINI_MAX_TOKENS,
    ENV,
    LOG_LEVEL
)
import logging

# Setup logging
logging.basicConfig(level=getattr(logging, LOG_LEVEL))
logger = logging.getLogger(__name__)

def create_llm(api_key: str) -> ChatGoogleGenerativeAI:
    """Create LLM instance with given API key"""
    return ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        google_api_key=api_key,
        temperature=GEMINI_TEMPERATURE,
        max_output_tokens=GEMINI_MAX_TOKENS,
        convert_system_message_to_human=True
    )

# Ambil tools keuangan
tools = get_financial_tools()

# Fungsi utama konsultasi
async def run_financial_consultation(message: str, phone_number: str) -> str:
    logger.info(f"Processing consultation for {phone_number} in {ENV} environment")
    
    # Load memory dari Redis atau buffer biasa
    memory = get_memory(
        mode="redis" if USE_REDIS_MEMORY else "buffer",
        phone_number=phone_number
    )

    # Clear memory untuk memulai percakapan baru
    memory.clear()

    last_error = None
    for api_key in GEMINI_API_KEYS:
        try:
            logger.info(f"Attempting consultation with API key: {api_key[:8]}...")
            
            # Buat LLM dengan API key saat ini
            llm = create_llm(api_key)
            
            # Buat agent dengan memory yang sudah diinisialisasi
            agent = initialize_agent(
                tools=tools,
                llm=llm,
                agent="chat-conversational-react-description",
                memory=memory,
                verbose=ENV == "development"  # Hanya tampilkan verbose di development
            )

            # Tambah sistem prompt (pesan awal)
            system_prompt = get_system_prompt(phone_number)
            memory.save_context(
                {"input": ""},  # Empty input for system message
                {"output": system_prompt}
            )

            # Jalankan agent
            result = agent.run(message)
            logger.info(f"Successfully processed consultation for {phone_number}")
            return result
            
        except Exception as e:
            last_error = e
            if "429" in str(e) or "500" in str(e) or "503" in str(e):  # Rate limit or server error
                logger.warning(f"API key {api_key[:8]}... failed with error: {str(e)}, trying next key...")
                continue
            else:
                logger.error(f"Unexpected error with API key {api_key[:8]}...: {str(e)}")
                continue
    
    # If we get here, all API keys failed
    error_msg = f"All Gemini API keys failed. Last error: {str(last_error)}"
    logger.error(error_msg)
    raise Exception(error_msg)
