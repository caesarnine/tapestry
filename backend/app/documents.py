import json
from datetime import datetime
from io import BytesIO
from typing import List

import magic
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Path,
    Query,
    UploadFile,
)
from pydantic import BaseModel
from pypdf import PdfReader
from sqlalchemy.orm import Session

from .chat import get_current_user
from .database import get_db
from .models import Document, User

router = APIRouter()

class TagModel(BaseModel):
    key: str
    value: str

@router.get("/")
async def get_documents(
    tags: List[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Document)

    if tags:
        for tag in tags:
            key, value = tag.split(':')
            query = query.filter(Document.tags.contains({key: value}))
    
    documents = query.all()
    return {"documents": [{"id": doc.id, "filename": doc.document_filename, "tags": doc.tags} for doc in documents]}

@router.get("/tags")
async def get_available_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Fetch all documents' tags
    documents = db.query(Document.tags).all()
    
    unique_tags = set()
    for doc in documents:
        if doc.tags:  # Check if tags is not None
            for tag in doc.tags:
                for key, value in tag.items():
                    unique_tags.add(f"{key}:{value}")
    
    return {"tags": list(unique_tags)}

@router.get("/{document_id}")
def get_document_by_id(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return document.to_dict()

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    tags: str = Form(...),  # Tags will be sent as a JSON string
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    content = await file.read()
    
    mime = magic.Magic(mime=True)
    file_type = mime.from_buffer(content)
    
    if file_type == "application/pdf":
        text = extract_text_from_pdf(content)
    elif file_type.startswith("text/"):
        text = content.decode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    
    # Parse and validate tags
    try:
        parsed_tags = json.loads(tags)
        if not isinstance(parsed_tags, list):
            raise ValueError("Tags must be a list")
        for tag in parsed_tags:
            if not isinstance(tag, dict) or 'key' not in tag or 'value' not in tag:
                raise ValueError("Each tag must be a dictionary with 'key' and 'value'")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for tags")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    new_document = Document(
        date=datetime.now().date(),
        content=text,
        document_filename=file.filename,
        tags=parsed_tags
    )
    
    db.add(new_document)
    db.commit()
    db.refresh(new_document)
    
    return {"message": "Document uploaded successfully", "document": new_document.to_dict()}

# Helper function to extract text from PDF
def extract_text_from_pdf(content):
    pdf = PdfReader(BytesIO(content))
    text = ""
    for page in pdf.pages:
        text += page.extract_text(extraction_mode="layout")
    return text

@router.delete("/{document_id}")
def delete_document(
    document_id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    db.delete(document)
    db.commit()
    
    return {"message": "Document deleted successfully"}

@router.put("/{document_id}/tags")
def update_document_tags(
    document_id: int = Path(...),
    tags: List[dict] = Body(...),  # Change to List[dict] to accept key-value pairs
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    document.tags = tags
    db.commit()
    db.refresh(document)
    
    return document.to_dict()
