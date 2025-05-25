import requests
from config.config import GEMINI_API_KEYS
import base64
import whisper
import tempfile
import os
import logging
import json

logger = logging.getLogger(__name__)
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

def call_gemini_with_key(prompt: str, api_key: str) -> str:
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }
    response = requests.post(
        f"{GEMINI_ENDPOINT}?key={api_key}",
        headers=headers,
        json=payload
    )
    response.raise_for_status()
    candidates = response.json().get("candidates", [])
    if not candidates:
        return "NONE"
    return candidates[0]["content"]["parts"][0]["text"]

def call_gemini(prompt: str) -> str:
    """
    Call Gemini API with fallback mechanism for multiple API keys.
    Will try each API key in sequence until one succeeds.
    """
    last_error = None
    
    for api_key in GEMINI_API_KEYS:
        try:
            logger.info(f"Attempting to call Gemini API with key: {api_key[:8]}...")
            return call_gemini_with_key(prompt, api_key)
        except requests.exceptions.HTTPError as e:
            last_error = e
            if e.response.status_code in [429, 500, 503]:  # Rate limit or server error
                logger.warning(f"API key {api_key[:8]}... failed with status {e.response.status_code}, trying next key...")
                continue
            else:
                raise  # Re-raise if it's not a rate limit or server error
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error with API key {api_key[:8]}...: {str(e)}")
            continue
    
    # If we get here, all API keys failed
    error_msg = f"All Gemini API keys failed. Last error: {str(last_error)}"
    logger.error(error_msg)
    raise Exception(error_msg)

def extract_expense_from_image(image_bytes: bytes) -> dict:
    """
    Extract expense information from receipt image using Gemini Vision API.
    Returns a dictionary containing expense details.
    """
    # Convert image bytes to base64
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Prepare the prompt for Gemini Vision
    prompt = """Analyze this receipt image and extract the transaction information. Return the data in this exact JSON format:

{
    "transactions": [
        {
            "amount": "total amount in numbers only (e.g. 50000)",
            "category": "one of these categories: Makanan, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Lainnya",
            "description": "brief description of items purchased",
            "date": "transaction date in YYYY-MM-DD format"
        }
    ]
}

Rules:
1. If there are multiple items in the receipt, create multiple transaction objects in the array
2. For amount, use only numbers without currency symbol or commas
3. For category, use only the predefined categories listed above
4. For date, use YYYY-MM-DD format. If date is not found, use today's date
5. Return only the JSON object, no other text or formatting

Example response for a single transaction:
{
    "transactions": [
        {
            "amount": "50000",
            "category": "Makanan",
            "description": "Nasi Goreng + Es Teh",
            "date": "2024-03-20"
        }
    ]
}

Example response for multiple transactions:
{
    "transactions": [
        {
            "amount": "25000",
            "category": "Makanan",
            "description": "Nasi Goreng",
            "date": "2024-03-20"
        },
        {
            "amount": "15000",
            "category": "Makanan",
            "description": "Es Teh",
            "date": "2024-03-20"
        }
    ]
}"""
    
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
            logger.info(f"Attempting to call Gemini Vision API with key: {api_key[:8]}...")
            
            # Log request payload (without image data for brevity)
            logger.debug(f"Request payload: {json.dumps({**payload, 'contents': [{**payload['contents'][0], 'parts': [payload['contents'][0]['parts'][0]]}]})}")
            
            response = requests.post(
                f"{GEMINI_ENDPOINT}?key={api_key}",
                headers=headers,
                json=payload
            )
            
            # Log response status and headers
            logger.info(f"Response status: {response.status_code}")
            logger.info(f"Response headers: {dict(response.headers)}")
            
            # Log raw response text
            response_text = response.text
            logger.info(f"Raw response text: {response_text}")
            
            response.raise_for_status()
            
            # Try to parse JSON response
            try:
                response_json = response.json()
                logger.info(f"Parsed JSON response: {json.dumps(response_json, indent=2)}")
                
                candidates = response_json.get("candidates", [])
                if not candidates:
                    raise Exception("No response from Gemini Vision API")
                    
                result_text = candidates[0]["content"]["parts"][0]["text"]
                logger.info(f"Extracted text from response: {result_text}")
                
                # Clean up the response text - remove any markdown formatting
                result_text = result_text.replace("```json", "").replace("```", "").strip()
                
                # Parse the JSON response
                result = json.loads(result_text)
                logger.info(f"Final parsed result: {json.dumps(result, indent=2)}")
                
                # Validate the result format
                if not isinstance(result, dict) or "transactions" not in result:
                    raise ValueError("Invalid response format: missing 'transactions' array")
                
                if not isinstance(result["transactions"], list):
                    raise ValueError("Invalid response format: 'transactions' must be an array")
                
                # Validate each transaction
                for transaction in result["transactions"]:
                    if not isinstance(transaction, dict):
                        raise ValueError("Invalid transaction format: must be an object")
                    
                    required_fields = ["amount", "category", "description", "date"]
                    for field in required_fields:
                        if field not in transaction:
                            raise ValueError(f"Missing required field: {field}")
                    
                    # Validate category
                    valid_categories = ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"]
                    if transaction["category"] not in valid_categories:
                        transaction["category"] = "Lainnya"
                    
                    # Clean amount - remove currency symbols and commas
                    amount = str(transaction["amount"]).replace("Rp", "").replace(".", "").replace(",", "").strip()
                    try:
                        transaction["amount"] = str(int(float(amount)))
                    except ValueError:
                        raise ValueError(f"Invalid amount format: {transaction['amount']}")
                
                # If there's only one transaction, return it directly
                if len(result["transactions"]) == 1:
                    return result["transactions"][0]
                
                return result["transactions"]
                
            except json.JSONDecodeError as json_err:
                logger.error(f"Failed to parse response as JSON: {str(json_err)}")
                raise
            
        except requests.exceptions.HTTPError as e:
            last_error = e
            if e.response.status_code in [429, 500, 503]:  # Rate limit or server error
                logger.warning(f"Vision API key {api_key[:8]}... failed with status {e.response.status_code}, trying next key...")
                continue
            else:
                logger.error(f"HTTP error with key {api_key[:8]}...: {str(e)}")
                logger.error(f"Response content: {e.response.text}")
                raise  # Re-raise if it's not a rate limit or server error
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error with Vision API key {api_key[:8]}...: {str(e)}")
            continue
    
    # If we get here, all API keys failed
    error_msg = f"All Gemini Vision API keys failed. Last error: {str(last_error)}"
    logger.error(error_msg)
    raise Exception(error_msg)

def extract_expense_from_voice(voice_bytes: bytes) -> str:
    """
    Convert voice recording to text using OpenAI Whisper.
    Returns the transcribed text.
    """
    try:
        # Save voice bytes to temporary file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            temp_file.write(voice_bytes)
            temp_file_path = temp_file.name

        # Load Whisper model
        model = whisper.load_model("base")
        
        # Transcribe audio
        result = model.transcribe(temp_file_path)
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        return result["text"]
        
    except Exception as e:
        raise Exception(f"Error processing voice recording: {str(e)}")
