from logic.gemini import call_gemini

def generate_sql_from_question(user_question: str, user_id: str, now_date: str) -> str:
    prompt = f"""
You are a financial assistant for users.

You have access to a table called `transactions` with the following columns:
- id (integer)
- user_id (string)
- date (YYYY-MM-DD)
- category (string)
- amount (integer)
- type (string, either 'expense' or 'income')

Generate a valid SQL query to answer the following question.

Constraints:
- Only show data for user_id = '{user_id}'
- If the question says "this month", use date from '{now_date[:7]}-01' to '{now_date}'
- Use SUM(amount) for total
- If category mentioned (e.g. "makan", "alfamart"), include it in WHERE clause
- If question is unclear, return "UNKNOWN"

Question: "{user_question}"

Only return the SQL query.
"""
    result = call_gemini(prompt)
    return result.strip()
