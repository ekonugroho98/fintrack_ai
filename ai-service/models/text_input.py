from pydantic import BaseModel

class TextInput(BaseModel):
    text: str
    phone_number: str 