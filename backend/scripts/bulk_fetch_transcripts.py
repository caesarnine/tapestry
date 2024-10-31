import asyncio
import os
import sys
from typing import List, Set

import httpx
from sqlalchemy import select

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from backend.app.documents import fetch_earnings_transcripts
from app.models import CompanyProfile
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("FINANCIAL_MODELING_PREP_API_KEY")
SCREENER_URL = f"https://financialmodelingprep.com/api/v3/stock-screener?isEtf=false&isFund=false&apikey={API_KEY}"
YEARS = [2023, 2024, 2025]
BATCH_SIZE = 5  # Number of tickers to process in each batch

async def fetch_tickers_from_api() -> Set[str]:
    async with httpx.AsyncClient() as client:
        response = await client.get(SCREENER_URL)
        response.raise_for_status()
        data = response.json()
        return set(item['symbol'] for item in data)

def fetch_tickers_from_db() -> Set[str]:
    db = SessionLocal()
    try:
        result = db.execute(select(CompanyProfile.symbol))
        return set(row[0] for row in result)
    finally:
        db.close()

async def process_batch(tickers: List[str]):
    db = SessionLocal()
    result = await fetch_earnings_transcripts(tickers, YEARS, db)
    print(result)
    db.close()

async def main():
    api_tickers = await fetch_tickers_from_api()
    db_tickers = fetch_tickers_from_db()
    
    all_tickers = ['FTRE', 'IQV', 'ICLR', 'MEDP', 'CRL'] + list(api_tickers.union(db_tickers))
    print(f"Total unique tickers: {len(all_tickers)}")
    print(f"API tickers: {len(api_tickers)}, DB tickers: {len(db_tickers)}")

    for i in range(0, len(all_tickers), BATCH_SIZE):
        batch = all_tickers[i:i+BATCH_SIZE]
        await process_batch(batch)
        print(f"Completed batch {i//BATCH_SIZE + 1} of {len(all_tickers)//BATCH_SIZE + 1}")
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(main())
