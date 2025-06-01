from logic.gemini import call_gemini
import base64
import requests
from config.config import GEMINI_API_KEYS
import logging
import os

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
GEMINI_VISION_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

def classify_message_intent(text: str) -> str:
    prompt = f"""
Classify the following text:

"{text}"

Does it fall into:
1. Financial transaction (expense or income) – e.g., "bought lunch 25k", "paid electricity 350k"
2. Financial consultation (question or request for financial summary) – e.g., "how much did I spend this month?", "which category is the highest?", "show me my spending report"
3. Neither

Answer with one word only: TRANSACTION, CONSULTATION, or NONE.

Rules:
- If the text asks a question or request about financial data (keywords: how much, what, when, show, view, report), classify as CONSULTATION.
- If the text describes a purchase or payment (keywords: buy, pay, transaction, expense, income), classify as TRANSACTION.
- If not applicable, classify as NONE.

Examples:
- "how much is POCI CELUP PREMIUM?" → CONSULTATION
- "buy POCI CELUP PREMIUM 25rb" → TRANSACTION
- "show transactions this month" → CONSULTATION
- "I want to buy POCI CELUP PREMIUM" → TRANSACTION
"""
    logger.info(f"Classifying message: {text}")
    logger.info(f"Using prompt: {prompt}")
    
    result = call_gemini(prompt).strip().upper()
    logger.info(f"Raw classification result: {result}")
    
    if result not in {"TRANSACTION", "CONSULTATION", "NONE"}:
        logger.warning(f"Invalid classification result: {result}, defaulting to NONE")
        return "NONE"
    
    logger.info(f"Final classification: {result}")
    return result


def classify_intent(text: str) -> dict:
    """
    Intent classifier with English-standard intent names.
    Combines heuristics + LLM (Gemini).
    """
    lowered = text.lower().strip()
    
    # Heuristic rules
    if "hapus" in lowered:
        return {"intent": "delete_transaction", "confidence": 0.95}
    elif "lihat" in lowered or "tampilkan" in lowered:
        return {"intent": "view_transaction", "confidence": 0.9}

    # LLM fallback
    label = classify_message_intent(text)  # TRANSACTION / CONSULTATION / NONE
    mapping = {
        "TRANSACTION": ("add_transaction", 0.9),
        "CONSULTATION": ("consultation", 0.9),
        "NONE": ("unknown", 0.5),
    }
    intent, confidence = mapping.get(label, ("unknown", 0.0))
    return {"intent": intent, "confidence": confidence}


def is_transaction(text: str) -> bool:
    """
    Check if the text is a financial transaction.
    """
    result = classify_message_intent(text)
    return result == "TRANSACTION"


def is_transaction_image(image_bytes: bytes) -> bool:
    """
    Check if the image is a receipt or transaction-related using Gemini Vision.
    """
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    prompt = """Analyze this image and determine if it's a receipt or transaction-related document.
    Look for elements like:
    - Store or merchant name
    - Date
    - Purchased items
    - Total amount
    - Payment method
    
    Respond YES if it's a receipt/transaction, or NO otherwise.
    """

    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": image_base64
                    }
                }
            ]
        }]
    }

    last_error = None
    for api_key in GEMINI_API_KEYS:
        try:
            logger.info(f"Checking image with API key: {api_key[:8]}...")
            response = requests.post(
                f"{GEMINI_VISION_ENDPOINT}?key={api_key}",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            candidates = response.json().get("candidates", [])
            if not candidates:
                raise Exception("No response from Gemini Vision API")
            result_text = candidates[0]["content"]["parts"][0]["text"].strip().upper()
            return result_text == "YES"
        except requests.exceptions.HTTPError as e:
            last_error = e
            if e.response.status_code in [429, 500, 503]:
                logger.warning(f"API key {api_key[:8]} failed with status {e.response.status_code}, trying next...")
                continue
            else:
                raise
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error with API key {api_key[:8]}: {str(e)}")
            continue

    logger.error(f"All Gemini Vision API keys failed. Last error: {str(last_error)}")
    return False
