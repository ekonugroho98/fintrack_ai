from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)

class ConsultInput(BaseModel):
    message: str = Field(..., description="Pesan konsultasi dari user")
    phone_number: str = Field(..., description="Nomor telepon user")

    def __init__(self, **data):
        try:
            super().__init__(**data)
            logger.info({
                "event": "consult_input_validation",
                "phone_number": data.get('phone_number'),
                "message_length": len(data.get('message', '')),
                "has_message": 'message' in data,
                "has_phone": 'phone_number' in data
            })
        except Exception as e:
            logger.error({
                "event": "consult_input_validation_error",
                "error": str(e),
                "data": data
            })
            raise
