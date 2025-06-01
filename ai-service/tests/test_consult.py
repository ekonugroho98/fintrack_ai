import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_consult_endpoint_success(monkeypatch):
    # Mock Gemini result
    def mock_generate_sql(*args, **kwargs):
        return "SELECT SUM(amount) AS total_pengeluaran FROM transactions WHERE user_id = '1e4d3c4f-ea2e-4b70-9df0-4e317b39130b';"

    def mock_execute_query(sql):
        print("MOCK EXECUTE QUERY CALLED")
        return [{"total_pengeluaran": 15560010}]

    # Patch fungsi di module asli
    import routes.process_consult as pc
    import utils.db as db
    monkeypatch.setattr(pc, "generate_sql_from_question", mock_generate_sql)
    monkeypatch.setattr(db, "execute_query", mock_execute_query)

    payload = {
        "user_id": "1e4d3c4f-ea2e-4b70-9df0-4e317b39130b",
        "question": "berapa total pengeluaran saya?"
    }

    response = client.post("/api/process_consult_keuangan", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["result"][0]["total_pengeluaran"] == 15560010

def test_consult_endpoint_unknown(monkeypatch):
    def mock_generate_sql(*args, **kwargs):
        return "UNKNOWN"

    import routes.process_consult as pc
    monkeypatch.setattr(pc, "generate_sql_from_question", mock_generate_sql)

    payload = {
        "user_id": "8a5c2ecb-b304-4ac4-b38f-5f998e08b8aa",
        "question": "kenapa langit berwarna biru?"
    }

    response = client.post("/api/process_consult_keuangan", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "error"

def test_process_text(monkeypatch):
    def mock_extract_expense_from_text(text):
        return {
            "amount": 10000,
            "category": "makanan",
            "description": "beli nasi goreng",
            "date": "2024-06-01"
        }
    def mock_save_transaction(phone_number, data):
        return None
    import logic.expense_extractor as ee
    import logic.utils as lu
    monkeypatch.setattr(ee, "extract_expense_from_text", mock_extract_expense_from_text)
    monkeypatch.setattr(lu, "save_transaction", mock_save_transaction)
    payload = {
        "text": "beli nasi goreng 10rb",
        "phone_number": "08123456789"
    }
    response = client.post("/api/process_text", json=payload)
    assert response.status_code == 200
    assert response.json()["message"] == "Transaksi berhasil diproses"
    assert response.json()["data"]["amount"] == 10000
    assert response.json()["data"]["category"] == "makanan"

def test_detect_intent(monkeypatch):
    def mock_classify_intent(text):
        return {"intent": "view_transaction", "confidence": 0.9}
    import logic.classifier as clf
    monkeypatch.setattr(clf, "classify_intent", mock_classify_intent)
    payload = {
        "text": "tampilkan transaksi bulan ini",
        "phone_number": "08123456789"
    }
    response = client.post("/api/intent/detect", json=payload)
    assert response.status_code == 200
    assert response.json()["intent"] == "view_transaction"
    assert response.json()["confidence"] == 0.9
