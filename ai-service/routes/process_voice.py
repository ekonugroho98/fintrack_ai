from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from logic.gemini import extract_expense_from_voice
from logic.utils import save_transaction
from logic.classifier import is_transaction
from logic.expense_extractor import extract_expense_from_text

router = APIRouter()

@router.post("/process_voice_expense_keuangan")
async def process_voice_expense_keuangan(
    voice: UploadFile = File(...),
    phone_number: str = Form(...)
):
    try:
        voice_bytes = await voice.read()
        text = extract_expense_from_voice(voice_bytes)
        if not is_transaction(text):
            return {"message": "Voice note tidak mengandung transaksi keuangan."}

        result = extract_expense_from_text(text)
        save_transaction(phone_number, result)
        return {"message": "Voice berhasil diproses", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
