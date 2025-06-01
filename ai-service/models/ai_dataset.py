from sqlalchemy import Column, String, Text, DateTime, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class AiDataset(Base):
    __tablename__ = "ai_dataset"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False)
    account_id = Column(String(36), nullable=False)
    type = Column(String, nullable=False)  # 'intent' or 'parsing'
    input = Column(Text, nullable=False)
    json_data = Column(JSON, nullable=True)
    label = Column(String, nullable=True)
    period = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "account_id": self.account_id,
            "type": self.type,
            "input": self.input,
            "json_data": self.json_data,
            "label": self.label,
            "period": self.period,
            "generated_at": self.generated_at.isoformat()
        }
