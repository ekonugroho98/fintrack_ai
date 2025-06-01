from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from logic.classifier import classify_intent
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class IntentRequest(BaseModel):
    text: str
    phone_number: str

class IntentResponse(BaseModel):
    intent: str
    confidence: float | None = None

@router.post("/intent/detect", response_model=IntentResponse)
async def detect_intent(request: IntentRequest):
    try:
        logger.info(f"Detecting intent for: {request.text} from {request.phone_number}")
        result = classify_intent(request.text)
        return IntentResponse(intent=result.get("intent"), confidence=result.get("confidence"))
    except Exception as e:
        logger.exception("Intent detection failed")
        raise HTTPException(status_code=500, detail=str(e))
