from fastapi import APIRouter, HTTPException, Body
from logic.embedding import generate_embedding

router = APIRouter()

@router.post("/generate_embedding")
async def embed_text(data: dict = Body(...)):
    text = data.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    try:
        embedding = await generate_embedding(text)
        return {"embedding": embedding}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
