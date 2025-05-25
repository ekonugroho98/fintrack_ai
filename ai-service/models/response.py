from pydantic import BaseModel

class ConsultResponse(BaseModel):
    reply: str
