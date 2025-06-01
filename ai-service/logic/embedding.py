import os
import httpx
from config.config import GEMINI_API_KEYS
import logging

logger = logging.getLogger(__name__)

async def generate_embedding(text: str) -> list:
    last_error = None
    for api_key in GEMINI_API_KEYS:
        try:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent"
                f"?key={api_key}"
            )
            body = {
                "content": {
                    "parts": [{"text": text}]
                }
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
                return response.json()["embedding"]["values"]
        except Exception as e:
            last_error = e
            if "429" in str(e) or "500" in str(e) or "503" in str(e):
                logger.warning(f"API key {api_key[:8]}... failed with error: {str(e)}, trying next key...")
                continue
            else:
                logger.error(f"Unexpected error with API key {api_key[:8]}...: {str(e)}")
                continue
    
    if last_error:
        raise last_error
    raise Exception("No valid API keys available")
