from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from logic.expense_extractor import extract_expense_from_voice
import logging
from pydantic import BaseModel
from typing import Optional, List

logger = logging.getLogger(__name__)
router = APIRouter()

class VoiceRequest(BaseModel):
    categories: Optional[List[str]] = None
    phone_number: Optional[str] = None

@router.post("/process-voice")
async def process_voice(
    voice: UploadFile = File(...),
    categories: Optional[List[str]] = Form(None),
    phone_number: Optional[str] = Form(None)
):
    try:
        logger.info("Processing voice message")
        content = await voice.read()
        result = extract_expense_from_voice(content, categories)
        logger.info(f"Voice processed: {result}")
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Error processing voice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
