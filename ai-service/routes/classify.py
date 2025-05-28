from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import google.generativeai as genai
import json
import logging
from typing import Optional, Dict, Any
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

router = APIRouter()
logger = logging.getLogger(__name__)

# Configure Gemini
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable is not set")

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro')

class MessageRequest(BaseModel):
    text: str
    phone_number: str

class ClassificationResponse(BaseModel):
    intent: str
    confidence: float
    context: Optional[Dict[str, Any]] = None

@router.post("/classify", response_model=ClassificationResponse)
async def classify_message(request: MessageRequest):
    try:
        logger.info({
            'event': 'classify_message_start',
            'phone_number': request.phone_number
        })
        
        # Prepare the prompt
        prompt = f"""You are a message classifier for a financial assistant. Classify the following message into one of these categories:
        - REPORT: User wants to see financial reports or summaries
        - TRANSACTION: User wants to add or manage transactions
        - CONSULTATION: User wants financial advice or consultation
        - NONE: Message doesn't fit any category

        Message: {request.text}

        Respond in JSON format:
        {{
            "intent": "CATEGORY",
            "confidence": 0.0-1.0,
            "context": {{
                "details": "Additional context if needed"
            }}
        }}"""

        # Call Gemini API
        response = model.generate_content(prompt)
        
        # Parse the response
        try:
            result = json.loads(response.text)
            logger.info({
                'event': 'classify_message_success',
                'phone_number': request.phone_number,
                'intent': result['intent']
            })
            return ClassificationResponse(**result)
        except json.JSONDecodeError:
            logger.error({
                'event': 'classify_message_error',
                'phone_number': request.phone_number,
                'error': 'Invalid JSON response from Gemini',
                'response': response.text
            })
            raise HTTPException(status_code=500, detail="Invalid response from AI service")

    except Exception as e:
        logger.error({
            'event': 'classify_message_error',
            'phone_number': request.phone_number,
            'error': str(e),
            'error_type': type(e).__name__
        })
        raise HTTPException(status_code=500, detail=str(e)) 