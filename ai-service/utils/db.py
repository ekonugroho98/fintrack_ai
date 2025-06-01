from sqlalchemy import text
from database.database import engine

def execute_query(sql: str):
    with engine.connect() as conn:
        result = conn.execute(text(sql))
        return [dict(row._mapping) for row in result]  # gunakan ._mapping agar compatible dengan SQLAlchemy 2.0
