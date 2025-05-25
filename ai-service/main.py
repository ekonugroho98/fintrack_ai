from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import process_text, process_image, process_voice, consult

app = FastAPI(title="AI Agent Keuangan API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Ganti dengan domain frontend-mu jika perlu
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(process_text.router, prefix="/api", tags=["Text Expense"])
app.include_router(process_image.router, prefix="/api", tags=["Image Expense"])
app.include_router(process_voice.router, prefix="/api", tags=["Voice Expense"])
app.include_router(consult.router, prefix="/api", tags=["Consultation"])

# Root endpoint (optional)
@app.get("/")
def root():
    return {"message": "AI Agent Keuangan API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
