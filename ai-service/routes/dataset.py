from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database.database import get_db
from models.ai_dataset import AiDataset
import uuid

router = APIRouter(prefix="/dataset", tags=["Dataset"])

class DatasetItem(BaseModel):
    user_id: str
    account_id: str
    type: str  # 'intent' or 'parsing'
    input: str
    json_data: dict
    label: Optional[str] = None
    period: Optional[str] = None

@router.post("/", status_code=201)
def create_dataset(item: DatasetItem, db: Session = Depends(get_db)):
    if item.type not in ["intent", "parsing"]:
        raise HTTPException(status_code=400, detail="Type must be 'intent' or 'parsing'")

    dataset = AiDataset(
        id=str(uuid.uuid4()),
        user_id=item.user_id,
        account_id=item.account_id,
        type=item.type,
        input=item.input,
        json_data=item.json_data,
        label=item.label,
        period=item.period,
        generated_at=datetime.utcnow()
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return {"status": "success", "id": dataset.id}

@router.get("/", response_model=List[dict])
def get_dataset(type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(AiDataset)
    if type:
        query = query.filter(AiDataset.type == type)
    results = query.order_by(AiDataset.generated_at.desc()).all()
    return [d.to_dict() for d in results]
