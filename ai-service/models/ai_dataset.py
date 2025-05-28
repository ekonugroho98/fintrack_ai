from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
import uuid
from datetime import datetime

Base = declarative_base()

class AiDataset(Base):
    __tablename__ = "ai_dataset"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    account_id = Column(UUID(as_uuid=True), nullable=False)
    json_data = Column(JSON, nullable=False)
    period = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
