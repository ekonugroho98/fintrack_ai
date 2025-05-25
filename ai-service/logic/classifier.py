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
Klasifikasikan teks berikut:

"{text}"

Apakah ini termasuk:
1. Transaksi keuangan (pengeluaran atau pemasukan) - contoh: "beli nasi goreng 25rb", "bayar listrik 350rb"
2. Konsultasi keuangan (pertanyaan tentang keuangan pribadi) - contoh: "berapa total pengeluaran bulan ini?", "kategori apa yang paling besar?", "berapa harga POCI CELUP PREMIUM?"
3. Bukan keduanya (hal lain)

Jawab dengan satu kata: TRANSAKSI, KONSULTASI, atau NONE.

Aturan:
- Jika teks mengandung pertanyaan (menggunakan kata tanya seperti 'berapa', 'apa', 'bagaimana', 'kapan', 'dimana', 'kenapa', 'mengapa', 'siapa') tentang harga, jumlah, atau informasi keuangan, klasifikasikan sebagai KONSULTASI
- Jika teks mengandung informasi pembelian atau pembayaran (menggunakan kata seperti 'beli', 'bayar', 'transaksi', 'pembelian', 'pembayaran'), klasifikasikan sebagai TRANSAKSI
- Jika teks tidak masuk kedua kategori di atas, klasifikasikan sebagai NONE

Contoh klasifikasi:
- "berapa harga POCI CELUP PREMIUM?" -> KONSULTASI (karena ada kata tanya 'berapa')
- "beli POCI CELUP PREMIUM 25rb" -> TRANSAKSI (karena ada kata 'beli' dan nominal)
- "POCI CELUP PREMIUM harganya berapa?" -> KONSULTASI (karena ada kata tanya 'berapa')
- "saya mau beli POCI CELUP PREMIUM" -> TRANSAKSI (karena ada kata 'beli')
"""
    logger.info(f"Classifying message: {text}")
    logger.info(f"Using prompt: {prompt}")
    
    result = call_gemini(prompt).strip().upper()
    logger.info(f"Raw classification result: {result}")
    
    if result not in {"TRANSAKSI", "KONSULTASI", "NONE"}:
        logger.warning(f"Invalid classification result: {result}, defaulting to NONE")
        return "NONE"
    
    logger.info(f"Final classification: {result}")
    return result

def is_transaction(text: str) -> bool:
    """
    Check if the text contains a transaction.
    Returns True if it's a transaction, False otherwise.
    """
    result = classify_message_intent(text)
    return result == "TRANSAKSI"

def is_transaction_image(image_bytes: bytes) -> bool:
    """
    Check if the image is a receipt or transaction-related image using Gemini Vision API.
    Returns True if it's a transaction image, False otherwise.
    """
    # Convert image bytes to base64
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Prepare the prompt for Gemini Vision
    prompt = """Analyze this image and determine if it's a receipt or transaction-related document.
    Look for common receipt elements like:
    - Store/merchant name
    - Date
    - Items purchased
    - Total amount
    - Payment method
    
    Answer with only YES if it's a receipt/transaction document, or NO if it's not.
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
            logger.info(f"Attempting to check image type with API key: {api_key[:8]}...")
            response = requests.post(
                f"{GEMINI_VISION_ENDPOINT}?key={api_key}",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            
            # Extract the response text
            candidates = response.json().get("candidates", [])
            if not candidates:
                raise Exception("No response from Gemini Vision API")
                
            result_text = candidates[0]["content"]["parts"][0]["text"].strip().upper()
            return result_text == "YES"
            
        except requests.exceptions.HTTPError as e:
            last_error = e
            if e.response.status_code in [429, 500, 503]:  # Rate limit or server error
                logger.warning(f"Vision API key {api_key[:8]}... failed with status {e.response.status_code}, trying next key...")
                continue
            else:
                raise  # Re-raise if it's not a rate limit or server error
        except Exception as e:
            last_error = e
            logger.error(f"Unexpected error with Vision API key {api_key[:8]}...: {str(e)}")
            continue
    
    # If we get here, all API keys failed
    error_msg = f"All Gemini Vision API keys failed. Last error: {str(last_error)}"
    logger.error(error_msg)
    return False
