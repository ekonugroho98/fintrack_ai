import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # gunakan anon key untuk client

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_db():
    """
    Get Supabase client instance
    """
    return supabase
