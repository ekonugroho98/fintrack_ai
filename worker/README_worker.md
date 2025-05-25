# 🧠 AiAgentKeuangan - Worker

Worker ini bertugas memproses pesan dari Redis (baik teks, gambar, atau suara) yang dikirim dari WhatsApp Gateway, kemudian meneruskannya ke AI Service untuk dianalisis sebagai transaksi keuangan. Hasilnya akan disimpan kembali sebagai transaksi terakhir ke Redis.

---

## 🚀 Fitur Utama

- ✅ Konsumsi pesan dari Redis channel `incoming-message`
- ✅ Proses 3 tipe pesan: `text`, `image`, `voice`
- ✅ Kirim data ke AI Service (`/api/process_*`) dengan retry + circuit breaker
- ✅ Simpan transaksi terakhir ke Redis (dengan fallback memory cache)
- ✅ Validasi akses fitur per user (`config/user_config.json`)
- ✅ Health check endpoint: `GET /status`

---

## 🗂️ Struktur Folder

```
worker/
├── index.js                # Entry point: konsumen pesan Redis
├── healthServer.js         # Endpoint HTTP untuk monitoring status
├── processor/              # Handler per tipe pesan
│   ├── processText.js
│   ├── processImage.js
│   └── processVoice.js
├── utils/                  
│   ├── apiClient.js        # Klien AI Service (dengan circuit breaker)
│   ├── circuitBreaker.js   # Circuit breaker custom
│   ├── memoryCache.js      # Fallback cache jika Redis error
│   ├── redis.js            # Koneksi dan utilitas Redis
│   ├── userConfig.js       # Konfigurasi fitur per user
│   └── logger.js           # Logging pakai pino
```

---

## ⚙️ Konfigurasi

### File `.env`
Contoh isi:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
AI_SERVICE_URL=http://localhost:8000
WORKER_PORT=3100
```

### File `config/user_config.json`

```json
{
  "users": {
    "6281234567890": {
      "name": "Eko",
      "features": ["text", "image", "voice"]
    },
    "6281111111111": {
      "name": "Aulia",
      "features": ["text"]
    }
  }
}
```

---

## ▶️ Menjalankan Manual (Local)

```bash
cd worker
npm install
node index.js
```

---

## 🐳 Menjalankan via Docker Compose

Pastikan sudah ditambahkan di `docker-compose.yml`:

```yaml
  worker:
    build:
      context: ./worker
    restart: always
    depends_on:
      - redis
      - ai-service
    volumes:
      - ./worker:/app
      - ./config:/app/config
    environment:
      - NODE_ENV=production
```

---

## 🔍 Health Check

```bash
curl http://localhost:3100/status
```

Response JSON berisi status Redis dan AI Service.

---

## 🧪 Testing

Untuk test manual kirim pesan dummy ke Redis:

```bash
redis-cli
PUBLISH incoming-message '{"type":"text","data":{"from":"6281234567890","text":"beli pulsa 20 ribu","messageId":"abc","timestamp":"...","pushName":"Eko"}}'
```

---

## 📦 Dependensi Utama

- Node.js 20+
- Redis
- AI Service (FastAPI)
- Pino (logging)
- Circuit breaker custom
- Form-data (untuk upload gambar/suara)

---

## ✍️ Author

Eko Nugroho – 2025  
