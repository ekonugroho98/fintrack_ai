from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from logic.consult_sql_generator import generate_sql_from_question
from utils.db import execute_query
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class ConsultRequest(BaseModel):
    user_id: str
    question: str

@router.post("/process_consult_keuangan")
async def process_consult_keuangan(data: ConsultRequest):
    try:
        now = datetime.now().strftime("%Y-%m-%d")

        # Step 1: Generate SQL dari pertanyaan
        sql = generate_sql_from_question(data.question, data.user_id, now)

        if sql.upper().startswith("SELECT"):
            # Step 2: Eksekusi SQL
            result = execute_query(sql)

            # Step 3: Format hasil agar user-friendly
            if isinstance(result, list) and result and isinstance(result[0], dict):
                first_key = next(iter(result[0]))
                nilai = result[0][first_key]
                if nilai is not None:
                    formatted = f"Rp {nilai:,.0f}".replace(",", ".")
                    jawaban = f"Total kamu adalah {formatted}."
                else:
                    jawaban = "Totalnya adalah Rp 0."
            else:
                jawaban = "Saya tidak menemukan hasil apapun dari pertanyaan kamu."

            return {
                "status": "success",
                "sql": sql,
                "result": result,
                "message": jawaban
            }

        elif "UNKNOWN" in sql:
            return {
                "status": "error",
                "message": "Maaf, saya tidak mengerti pertanyaannya."
            }

        else:
            raise HTTPException(status_code=400, detail="Query tidak valid.")

    except Exception as e:
        logger.error(f"[ERROR] process_consult_keuangan: {e}")
        raise HTTPException(status_code=500, detail="Terjadi kesalahan pada server.")
