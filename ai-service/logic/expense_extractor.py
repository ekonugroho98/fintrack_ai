from logic.gemini import call_gemini
from datetime import datetime
import json
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_expense_from_text(text: str, categories: list = None) -> dict:
    """
    Extract expense information from text input using Gemini.
    Returns a dictionary containing expense details.
    """
    # Use provided categories or default ones
    valid_categories = categories or ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"]
    
    logger.info({
        "event": "extract_expense_start",
        "text_length": len(text),
        "provided_categories": categories,
        "valid_categories": valid_categories
    })
    
    prompt = f"""
    Ekstrak informasi transaksi dari teks berikut dalam format JSON:
    "{text}"

    Format JSON yang diharapkan:
    {{
        "amount": <jumlah dalam angka>,
        "category": <kategori pengeluaran>,
        "description": <deskripsi singkat>,
        "date": <tanggal dalam format YYYY-MM-DD jika ada, null jika tidak ada>
    }}

    Kategori yang tersedia: {', '.join(valid_categories)}
    Jika kategori tidak cocok dengan yang tersedia, gunakan "Lainnya"
    Return hanya JSON object, tidak ada teks lain.
    """
    
    try:
        logger.info({
            "event": "sending_to_gemini",
            "prompt_length": len(prompt),
            "valid_categories": valid_categories
        })
        
        result = call_gemini(prompt)
        
        logger.info({
            "event": "gemini_response_received",
            "raw_response": result,
            "response_length": len(result)
        })
        
        # Clean up response if needed
        result = result.strip()
        if result.startswith('```json'):
            result = result[7:]
        if result.endswith('```'):
            result = result[:-3]
        result = result.strip()
        
        logger.info({
            "event": "cleaned_response",
            "cleaned_response": result
        })
        
        data = json.loads(result)
        
        logger.info({
            "event": "json_parsed",
            "parsed_data": data,
            "category": data.get("category"),
            "is_valid_category": data.get("category") in valid_categories
        })
        
        # Validasi data
        if not isinstance(data.get("amount"), (int, float)):
            logger.warning({
                "event": "invalid_amount",
                "amount": data.get("amount"),
                "type": type(data.get("amount")).__name__
            })
            data["amount"] = 0
            
        if not data.get("category"):
            logger.warning({
                "event": "missing_category",
                "data": data
            })
            data["category"] = "Lainnya"
        elif data.get("category") not in valid_categories:
            logger.warning({
                "event": "invalid_category",
                "provided_category": data.get("category"),
                "valid_categories": valid_categories
            })
            data["category"] = "Lainnya"
            
        if not data.get("description"):
            logger.warning({
                "event": "missing_description",
                "data": data
            })
            data["description"] = text
            
        if not data.get("date"):
            logger.warning({
                "event": "missing_date",
                "data": data
            })
            data["date"] = datetime.now().strftime("%Y-%m-%d")
            
        logger.info({
            "event": "final_data",
            "final_data": data,
            "category": data["category"],
            "amount": data["amount"],
            "has_description": bool(data["description"]),
            "has_date": bool(data["date"])
        })
        
        return data
        
    except json.JSONDecodeError as e:
        logger.error({
            "event": "json_decode_error",
            "error": str(e),
            "raw_result": result,
            "text": text
        })
        return {
            "amount": 0,
            "category": "Lainnya",
            "description": text,
            "date": datetime.now().strftime("%Y-%m-%d")
        }
    except Exception as e:
        logger.error({
            "event": "unexpected_error",
            "error": str(e),
            "error_type": type(e).__name__,
            "text": text
        })
        return {
            "amount": 0,
            "category": "Lainnya",
            "description": text,
            "date": datetime.now().strftime("%Y-%m-%d")
        }

def extract_expense_from_voice(voice_content: bytes, categories: list = None) -> dict:
    """
    Extract expense information from voice message using Gemini.
    Returns a dictionary containing expense details.
    """
    # Use provided categories or default ones
    valid_categories = categories or ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"]
    
    prompt = f"""
    Ekstrak informasi transaksi dari pesan suara berikut dalam format JSON.
    Transkripsi pesan suara: "{voice_content}"

    Format JSON yang diharapkan:
    {{
        "amount": <jumlah dalam angka>,
        "category": <kategori pengeluaran>,
        "description": <deskripsi singkat>,
        "date": <tanggal dalam format YYYY-MM-DD jika ada, null jika tidak ada>
    }}

    Kategori yang tersedia: {', '.join(valid_categories)}
    Jika kategori tidak cocok dengan yang tersedia, gunakan "Lainnya"
    Return hanya JSON object, tidak ada teks lain.
    """
    
    try:
        logger.info(f"Sending voice prompt to Gemini")
        result = call_gemini(prompt)
        logger.info(f"Raw response from Gemini for voice: {result}")
        
        # Clean up response if needed
        result = result.strip()
        if result.startswith('```json'):
            result = result[7:]
        if result.endswith('```'):
            result = result[:-3]
        result = result.strip()
        
        logger.info(f"Cleaned voice response: {result}")
        
        data = json.loads(result)
        logger.info(f"Parsed JSON data from voice: {data}")
        
        # Validasi data
        if not isinstance(data.get("amount"), (int, float)):
            logger.warning(f"Invalid amount format from voice: {data.get('amount')}")
            data["amount"] = 0
        if not data.get("category"):
            logger.warning("Missing category in voice")
            data["category"] = "uncategorized"
        if not data.get("description"):
            logger.warning("Missing description in voice")
            data["description"] = "Transaksi dari pesan suara"
        if not data.get("date"):
            logger.warning("Missing date in voice")
            data["date"] = datetime.now().strftime("%Y-%m-%d")
            
        logger.info(f"Final processed voice data: {data}")
        return data
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in voice: {str(e)}")
        logger.error(f"Failed to parse voice response: {result}")
        return {
            "amount": 0,
            "category": "uncategorized",
            "description": "Transaksi dari pesan suara",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
    except Exception as e:
        logger.error(f"Unexpected error in voice processing: {str(e)}")
        return {
            "amount": 0,
            "category": "uncategorized",
            "description": "Transaksi dari pesan suara",
            "date": datetime.now().strftime("%Y-%m-%d")
        } 