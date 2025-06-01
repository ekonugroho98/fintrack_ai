from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import process_text, process_image, process_voice, consult, process_consult
from routes import detect_intent
from routes import dataset
from models.ai_dataset import Base
from database.database import engine
from routes import embedding

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
app.include_router(detect_intent.router, prefix="/api", tags=["Intent Detection"])
app.include_router(dataset.router, prefix="/api", tags=["Dataset"])
app.include_router(process_consult.router, prefix="/api", tags=["Consultation"])
app.include_router(embedding.router, prefix="/api", tags=["Embedding"])

# Create DB tables
Base.metadata.create_all(bind=engine)

# Root endpoint (optional)
@app.get("/")
def root():
    return {"message": "AI Agent Keuangan API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
