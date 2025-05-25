from fastapi import APIRouter, HTTPException
from models.consult_input import ConsultInput
from models.response import ConsultResponse
from langchain_agent.agent import run_financial_consultation
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/consult_keuangan", response_model=ConsultResponse)
async def consult_keuangan(request: ConsultInput):
    try:
        # Log request details
        logger.info({
            "event": "consultation_request",
            "phone_number": request.phone_number,
            "message": request.message,
            "request_type": type(request).__name__
        })

        # Log request as dict for debugging
        logger.debug(f"Request data: {request.dict()}")

        reply = await run_financial_consultation(
            message=request.message,
            phone_number=request.phone_number
        )

        # Log successful response
        logger.info({
            "event": "consultation_success",
            "phone_number": request.phone_number,
            "reply_length": len(reply) if reply else 0
        })

        return {"reply": reply}
    except Exception as e:
        # Log detailed error information
        logger.error({
            "event": "consultation_error",
            "phone_number": request.phone_number if hasattr(request, 'phone_number') else None,
            "message": request.message if hasattr(request, 'message') else None,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "error_details": getattr(e, 'detail', None)
        })
        raise HTTPException(status_code=500, detail=f"Error during consultation: {str(e)}")
