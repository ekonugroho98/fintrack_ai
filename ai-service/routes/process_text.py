from fastapi import APIRouter, HTTPException, Depends
from logic.classifier import classify_message_intent
from models.text_input import TextInput
from logic.expense_extractor import extract_expense_from_text
from logic.utils import save_transaction, save_to_ai_dataset
from database import get_db
from sqlalchemy.orm import Session
import logging
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/process_expense_keuangan")
async def process_expense_keuangan(data: TextInput, db: Session = Depends(get_db)):
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
        user = db.query(User).filter_by(phone_number=data.phone_number).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user.id
        account_id = user.account_id
        save_to_ai_dataset(db, user_id, account_id, result)
        return {"message": "Transaksi berhasil diproses", "data": result}
    except Exception as e:
        logger.error(f"Error processing transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
