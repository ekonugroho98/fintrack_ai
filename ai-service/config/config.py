import os
from dotenv import load_dotenv
from supabase import create_client
from database import get_db

load_dotenv()

# Environment
ENV = os.getenv("ENV", "development")  # "development" or "production"

# API Keys
GEMINI_API_KEYS = [
    os.getenv("GEMINI_API_KEY"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3")
]
GEMINI_API_KEYS = [key for key in GEMINI_API_KEYS if key]  # Remove None values

# Model Configuration
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_TEMPERATURE = float(os.getenv("GEMINI_TEMPERATURE", "0"))
GEMINI_MAX_TOKENS = int(os.getenv("GEMINI_MAX_TOKENS", "2048"))

# Redis Configuration
USE_REDIS_MEMORY = os.getenv("USE_REDIS_MEMORY", "true").lower() == "true"
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO" if ENV == "production" else "DEBUG")

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # gunakan anon key untuk client

# Mendapatkan instance Supabase
supabase = get_db()

# Contoh query
response = supabase.table('your_table').select("*").execute()


