import redis
import json
from datetime import datetime

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

def save_transaction(phone_number: str, data: dict):
    bulan = datetime.now().strftime("%Y-%m")
    key = f"keuangan:{phone_number}:{bulan}"
    r.rpush(key, json.dumps(data))
    r.expire(key, 60 * 60 * 24 * 90)  # simpan selama 3 bulan
