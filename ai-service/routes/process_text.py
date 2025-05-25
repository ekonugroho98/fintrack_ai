from fastapi import APIRouter, HTTPException
from logic.classifier import classify_message_intent
from models.text_input import TextInput
from logic.expense_extractor import extract_expense_from_text
from logic.utils import save_transaction
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/process_expense_keuangan")
async def process_expense_keuangan(data: TextInput):
    logger.info(f"Processing text: {data.text}")
    
    intent = classify_message_intent(data.text)
    logger.info(f"Message intent: {intent}")

    if intent == "KONSULTASI":
        logger.info("Message classified as consultation, redirecting to consult endpoint")
        return {"message": "Teks ini merupakan konsultasi, silakan gunakan endpoint /consult_keuangan"}
    elif intent == "NONE":
        logger.info("Message classified as none")
        return {"message": "Teks tidak terdeteksi sebagai transaksi atau konsultasi."}

    try:
        logger.info("Message classified as transaction, extracting expense data")
        result = extract_expense_from_text(data.text)
        save_transaction(data.phone_number, result)
        logger.info(f"Transaction saved: {result}")
        return {"message": "Transaksi berhasil diproses", "data": result}
    except Exception as e:
        logger.error(f"Error processing transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
