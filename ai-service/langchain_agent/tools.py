from langchain.agents import Tool
import redis
import json
from datetime import datetime
from collections import defaultdict

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Ambil transaksi dari Redis
def get_transaksi(phone_number: str, bulan: str):
    key = f"keuangan:{phone_number}:{bulan}"
    transaksi = r.lrange(key, 0, -1)
    return [json.loads(item) for item in transaksi if item]

# Tool 1: Total pengeluaran bulan ini
def total_pengeluaran_bulan_ini(phone_number: str) -> str:
    now = datetime.now().strftime("%Y-%m")
    transaksi = get_transaksi(phone_number, now)
    total = sum(item["amount"] for item in transaksi if item["type"] == "expense")
    return f"Total pengeluaran bulan ini adalah Rp {total:,.0f}"

# Tool 2: Kategori terbesar bulan ini
def kategori_terbesar_bulan_ini(phone_number: str) -> str:
    now = datetime.now().strftime("%Y-%m")
    transaksi = get_transaksi(phone_number, now)
    kategori_total = defaultdict(int)
    for item in transaksi:
        if item["type"] == "expense":
            kategori_total[item.get("category", "lainnya")] += item["amount"]
    if not kategori_total:
        return "Belum ada transaksi pengeluaran bulan ini."
    kategori = max(kategori_total, key=kategori_total.get)
    total = kategori_total[kategori]
    return f"Kategori pengeluaran terbesar bulan ini adalah '{kategori}' dengan total Rp {total:,.0f}"

# Tool 3: Rata-rata harian bulan ini
def rata_rata_harian(phone_number: str) -> str:
    now = datetime.now()
    bulan = now.strftime("%Y-%m")
    transaksi = get_transaksi(phone_number, bulan)
    per_hari = defaultdict(int)
    for item in transaksi:
        if item["type"] == "expense":
            tanggal = item.get("date", "")
            per_hari[tanggal] += item["amount"]
    if not per_hari:
        return "Belum ada transaksi pengeluaran untuk dihitung rata-rata harian."
    rata_rata = sum(per_hari.values()) / len(per_hari)
    return f"Rata-rata pengeluaran harian bulan ini adalah Rp {rata_rata:,.0f}"

# Tool 4: Prediksi pengeluaran bulan depan (sederhana: ambil rata-rata 2 bulan terakhir)
def prediksi_bulan_depan(phone_number: str) -> str:
    now = datetime.now()
    bulan_ini = now.strftime("%Y-%m")
    bulan_lalu = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    
    total_ini = sum(item["amount"] for item in get_transaksi(phone_number, bulan_ini) if item["type"] == "expense")
    total_lalu = sum(item["amount"] for item in get_transaksi(phone_number, bulan_lalu) if item["type"] == "expense")

    if total_ini == 0 and total_lalu == 0:
        return "Tidak ada data pengeluaran untuk memprediksi bulan depan."
    
    prediksi = (total_ini + total_lalu) / 2
    return f"Prediksi pengeluaran bulan depan sekitar Rp {prediksi:,.0f}"

# Daftar tools
def get_financial_tools():
    return [
        Tool.from_function(
            name="total_pengeluaran_bulan_ini",
            description="Melihat total pengeluaran bulan ini dari user",
            func=total_pengeluaran_bulan_ini
        ),
        Tool.from_function(
            name="kategori_terbesar_bulan_ini",
            description="Melihat kategori pengeluaran terbesar bulan ini",
            func=kategori_terbesar_bulan_ini
        ),
        Tool.from_function(
            name="rata_rata_harian_bulan_ini",
            description="Menghitung rata-rata pengeluaran harian bulan ini",
            func=rata_rata_harian
        ),
        Tool.from_function(
            name="prediksi_pengeluaran_bulan_depan",
            description="Prediksi pengeluaran bulan depan berdasarkan 2 bulan terakhir",
            func=prediksi_bulan_depan
        ),
    ]
