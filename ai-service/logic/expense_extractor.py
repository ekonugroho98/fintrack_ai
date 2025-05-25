from logic.gemini import call_gemini
from datetime import datetime
import json
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_expense_from_text(text: str) -> dict:
    """
    Extract expense information from text input using Gemini.
    Returns a dictionary containing expense details.
    """
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

    Contoh kategori: makanan, transportasi, belanja, tagihan, hiburan, kesehatan, pendidikan, lainnya
    Return hanya JSON object, tidak ada teks lain.
    """
    
    try:
        logger.info(f"Sending prompt to Gemini: {prompt}")
        result = call_gemini(prompt)
        logger.info(f"Raw response from Gemini: {result}")
        
        # Clean up response if needed
        result = result.strip()
        if result.startswith('```json'):
            result = result[7:]
        if result.endswith('```'):
            result = result[:-3]
        result = result.strip()
        
        logger.info(f"Cleaned response: {result}")
        
        data = json.loads(result)
        logger.info(f"Parsed JSON data: {data}")
        
        # Validasi data
        if not isinstance(data.get("amount"), (int, float)):
            logger.warning(f"Invalid amount format: {data.get('amount')}")
            data["amount"] = 0
        if not data.get("category"):
            logger.warning("Missing category")
            data["category"] = "uncategorized"
        if not data.get("description"):
            logger.warning("Missing description")
            data["description"] = text
        if not data.get("date"):
            logger.warning("Missing date")
            data["date"] = datetime.now().strftime("%Y-%m-%d")
            
        logger.info(f"Final processed data: {data}")
        return data
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {str(e)}")
        logger.error(f"Failed to parse response: {result}")
        return {
            "amount": 0,
            "category": "uncategorized",
            "description": text,
            "date": datetime.now().strftime("%Y-%m-%d")
        }
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {
            "amount": 0,
            "category": "uncategorized",
            "description": text,
            "date": datetime.now().strftime("%Y-%m-%d")
        } 