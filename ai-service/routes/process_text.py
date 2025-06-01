from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.text_input import TextInput
from logic.expense_extractor import extract_expense_from_text
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class TextRequest(BaseModel):
    text: str
    categories: list = None  # Optional list of categories from database
    phone_number: str = None  # Optional phone number

@router.post("/process-text")
async def process_text(request: TextRequest):
    try:
        logger.info(f"Processing transaction text: {request.text}")
        result = extract_expense_from_text(request.text, request.categories)
        logger.info(f"Transaction processed: {result}")
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Error processing text: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process_text")
async def process_expense_keuangan(data: TextInput):
    try:
        logger.info(f"Processing transaction text: {data.text}")
        result = extract_expense_from_text(data.text)
        logger.info(f"Transaction saved: {result}")
        return {"message": "Transaksi berhasil diproses", "data": result}
    except Exception as e:
        logger.exception("Failed to process transaction")
        raise HTTPException(status_code=500, detail=str(e))
