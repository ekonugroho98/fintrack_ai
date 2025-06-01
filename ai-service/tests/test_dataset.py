import requests

BASE_URL = "http://localhost:8000/api/dataset"

# Test insert dataset
def test_insert_dataset():
    payload = {
        "user_id": "8a5c2ecb-b304-4ac4-b38f-5f998e08b8aa",
        "account_id": "f89b13b1-6af7-4f8d-a961-b91f20db14fa",
        "type": "intent",
        "input": "Tolong tampilkan transaksi bulan ini",
        "json_data": {
            "intent": "lihat_transaksi"
        },
        "label": "lihat_transaksi",
        "period": "bulan_ini"
    }
    response = requests.post(BASE_URL, json=payload)
    if response.headers.get("content-type") == "application/json":
        print(response.json())
    else:
        print(response.text)

# Test get all dataset
def test_get_all_dataset():
    response = requests.get(BASE_URL)
    if response.headers.get("content-type") == "application/json":
        print("All dataset:", response.status_code, response.json())
    else:
        print("All dataset:", response.status_code, response.text)

# Test get dataset by type
def test_get_by_type():
    response = requests.get(BASE_URL + "?type=intent")
    if response.headers.get("content-type") == "application/json":
        print("Filtered dataset:", response.status_code, response.json())
    else:
        print("Filtered dataset:", response.status_code, response.text)

if __name__ == "__main__":
    test_insert_dataset()
    test_get_all_dataset()
    test_get_by_type()
