from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .chat import router as chat_router
from .documents import router as document_router

app = FastAPI()

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to match your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a new APIRouter with the /api prefix
api_router = APIRouter(prefix="/api")

# Include both chat_router and financial_data_router in the api_router
api_router.include_router(chat_router, prefix="/chat", tags=["Chat"])
api_router.include_router(document_router, prefix="/documents", tags=["Documents"])

# Include the new user-related endpoints
api_router.include_router(chat_router, prefix="/users", tags=["Users"])

# Include the api_router in the main app
app.include_router(api_router)

# Optionally, remove or comment out the direct inclusion of financial_data_router
# app.include_router(financial_data_router)