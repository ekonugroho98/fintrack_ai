# 📦 Setup Worker AiAgentKeuangan (Lokal & Docker)

Dokumentasi ini menjelaskan cara menjalankan worker secara **manual (lokal)** maupun **menggunakan Docker Compose**.

---

## ✅ 1. Prasyarat

- Node.js v20+
- Redis server (lokal atau via Docker)
- AI Service (FastAPI) berjalan di `http://localhost:8000`
- Folder project `aiagent-keuangan/` dengan struktur lengkap

---

## ▶️ 2. Jalankan Secara Manual (Local Dev)

### Langkah:

1. Pindah ke direktori worker:
```bash
cd aiagent-keuangan/worker
```

2. Salin file `.env.example` menjadi `.env` dan sesuaikan jika perlu:
```bash
cp .env.example .env
```

3. Install dependency:
```bash
npm install
```

4. Jalankan worker:
```bash
node index.js
```

### Cek status:
```bash
curl http://localhost:3100/status
```

---

## 🐳 3. Jalankan via Docker Compose

### Struktur project harus seperti ini:

```
aiagent-keuangan/
├── worker/
├── config/
│   └── user_config.json
├── docker-compose.yml
```

### Tambahkan ke `docker-compose.yml`:

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
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - AI_SERVICE_URL=http://ai-service:8000
      - WORKER_PORT=3100
```

### Jalankan:

```bash
docker compose up --build worker
```

---

## 🔍 Health Check

```bash
curl http://localhost:3100/status
```

Akan menampilkan JSON status Redis & AI Service:

```json
{
  "status": "ok",
  "redis": {
    "isConnected": true,
    ...
  },
  "aiService": {
    "baseUrl": "http://localhost:8000",
    "circuitBreaker": {
      "isOpen": false
    }
  }
}
```

---

## 🧪 Testing Manual

Kirim pesan dummy ke Redis:

```bash
redis-cli
PUBLISH incoming-message '{"type":"text","data":{"from":"6281234567890","text":"beli pulsa 20 ribu","messageId":"abc","timestamp":"2025-05-23T12:00:00Z","pushName":"Eko"}}'
```

---

## ✨ Selesai!
Worker siap dijalankan dan diintegrasikan ke dalam pipeline AiAgentKeuangan.
