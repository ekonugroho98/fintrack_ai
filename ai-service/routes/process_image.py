from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from logic.gemini import extract_expense_from_image
from logic.utils import save_transaction
from logic.classifier import is_transaction_image
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/process_image_expense_keuangan")
async def process_image_expense_keuangan(
    image: UploadFile = File(...),
    phone_number: str = Form(...)
):
    try:
        logger.info(f"Processing image for {phone_number}")
        image_bytes = await image.read()
        
        logger.info({
            "event": "image_received",
            "phone_number": phone_number,
            "content_type": image.content_type,
            "file_size": len(image_bytes),
            "filename": image.filename
        })

        # Log first few bytes of image for debugging
        logger.debug(f"Image bytes preview: {image_bytes[:100]}")

        if not is_transaction_image(image_bytes):
            logger.warn({
                "event": "not_transaction_image",
                "phone_number": phone_number
            })
            return {"message": "Gambar tidak terdeteksi sebagai struk transaksi."}

        logger.info({
            "event": "extracting_expense",
            "phone_number": phone_number
        })

        try:
            result = extract_expense_from_image(image_bytes)
            logger.info({
                "event": "expense_extracted",
                "phone_number": phone_number,
                "result": json.dumps(result, indent=2)
            })
            
            # Handle both single transaction and array of transactions
            transactions = result if isinstance(result, list) else [result]
            
            # Save each transaction
            for transaction in transactions:
                save_transaction(phone_number, transaction)
            
            logger.info({
                "event": "transactions_saved",
                "phone_number": phone_number,
                "count": len(transactions)
            })

            return {
                "message": f"Berhasil memproses {len(transactions)} transaksi",
                "data": transactions
            }
            
        except Exception as e:
            logger.error({
                "event": "expense_extraction_failed",
                "phone_number": phone_number,
                "error": str(e),
                "error_type": type(e).__name__
            })
            raise

    except Exception as e:
        logger.error({
            "event": "image_processing_error",
            "phone_number": phone_number,
            "error": str(e),
            "error_type": type(e).__name__,
            "error_details": getattr(e, 'response', None) and getattr(e.response, 'text', None)
        })
        raise HTTPException(status_code=500, detail=str(e))
