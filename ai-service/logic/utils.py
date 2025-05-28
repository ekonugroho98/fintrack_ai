import redis
import json
from datetime import datetime
from models.ai_dataset import AiDataset
from sqlalchemy.orm import Session

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

def save_transaction(phone_number: str, data: dict):
    bulan = datetime.now().strftime("%Y-%m")
    key = f"keuangan:{phone_number}:{bulan}"
    r.rpush(key, json.dumps(data))
    r.expire(key, 60 * 60 * 24 * 90)  # simpan selama 3 bulan

def save_to_ai_dataset(db: Session, user_id: str, account_id: str, json_data: dict):
    period = json_data.get("tanggal", "")[:7]  # contoh: "2025-05"
    ai_data = AiDataset(
        user_id=user_id,
        account_id=account_id,
        json_data=json_data,
        period=period,
        generated_at=datetime.utcnow()
    )
    db.add(ai_data)
    db.commit()
