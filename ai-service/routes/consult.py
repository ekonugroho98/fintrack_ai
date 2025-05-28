from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import openai
import json
import redis
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class MessageRequest(BaseModel):
    text: str
    phone_number: str

def get_user_transactions(phone_number: str, days: int = 30) -> list:
    """Get user transactions from Redis"""
    try:
        # Get transactions from Redis
        transactions = []
        pattern = f"transactions:{phone_number}:*"
        for key in redis_client.scan_iter(match=pattern):
            transaction = json.loads(redis_client.get(key))
            transaction_date = datetime.fromisoformat(transaction['date'])
            if (datetime.now() - transaction_date).days <= days:
                transactions.append(transaction)
        return transactions
    except Exception as e:
        logger.error({
            "event": "get_transactions_error",
            "phone_number": phone_number,
            "error": str(e)
        })
        return []

def analyze_spending(transactions: list) -> dict:
    """Analyze spending patterns"""
    total_expense = 0
    category_expenses = {}
    merchant_expenses = {}
    
    for t in transactions:
        if t['type'] == 'expense':
            amount = float(t['amount'])
            total_expense += amount
            
            # Category analysis
            category = t['category']
            category_expenses[category] = category_expenses.get(category, 0) + amount
            
            # Merchant analysis
            if t.get('merchant'):
                merchant = t['merchant']
                merchant_expenses[merchant] = merchant_expenses.get(merchant, 0) + amount
    
    return {
        'total_expense': total_expense,
        'category_expenses': category_expenses,
        'merchant_expenses': merchant_expenses,
        'transaction_count': len(transactions)
    }

@router.post("/consultation")
async def process_consultation(request: MessageRequest):
    try:
        logger.info({
            "event": "consultation_start",
            "phone_number": request.phone_number
        })

        # Get user's transactions
        transactions = get_user_transactions(request.phone_number)
        analysis = analyze_spending(transactions)
        
        # Create a detailed prompt for the AI
        prompt = f"""As a financial advisor, analyze the following data and answer the user's question:

User Question: {request.text}

Transaction Analysis:
- Total Expenses: Rp{analysis['total_expense']:,.2f}
- Number of Transactions: {analysis['transaction_count']}
- Category Breakdown: {json.dumps(analysis['category_expenses'], indent=2)}
- Merchant Breakdown: {json.dumps(analysis['merchant_expenses'], indent=2)}

Recent Transactions:
{json.dumps(transactions[-5:], indent=2)}

Please provide a detailed, helpful response that:
1. Directly answers the user's question
2. Includes specific insights from their transaction data
3. Provides actionable advice
4. Uses a friendly, conversational tone
5. Includes relevant emojis for better readability

Format your response in Indonesian language."""

        # Get consultation response from OpenAI
        response = await openai.ChatCompletion.acreate(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful financial advisor who provides detailed, personalized advice based on transaction data."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )

        logger.info({
            "event": "consultation_success",
            "phone_number": request.phone_number
        })

        return {"reply": response.choices[0].message.content}

    except Exception as e:
        logger.error({
            "event": "consultation_error",
            "phone_number": request.phone_number,
            "error": str(e),
            "error_type": type(e).__name__
        })
        raise HTTPException(status_code=500, detail=str(e))
