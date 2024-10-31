import datetime
import json

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date)
    content = Column(Text)
    document_filename = Column(String)
    tags = Column(JSON)

    def to_dict(self):
        return {
            "id": self.id,
            "date": str(self.date),
            "content": self.content,
            "document_filename": self.document_filename,
            "tags": self.tags,
        }

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    messages = relationship("Message", back_populates="conversation")
    websocket_messages = relationship("WebSocketMessage", back_populates="conversation")
    user_id = Column(Integer, ForeignKey("users.id"))
    user = relationship("User", back_populates="conversations")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "user_id": self.user_id,
        }

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    role = Column(String)
    content = Column(JSON)  # Changed from Text to JSON
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,  # No need to parse, it's already a dict
            "created_at": self.created_at.isoformat(),
        }

class WebSocketMessage(Base):
    __tablename__ = "websocket_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    message_type = Column(String)  # e.g., 'user', 'assistant', 'system', 'tool_call', etc.
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    conversation = relationship("Conversation", back_populates="websocket_messages")

    def to_dict(self):
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "message_type": self.message_type,
            "content": json.loads(self.content),
            "timestamp": self.timestamp.isoformat(),
        }

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    conversations = relationship("Conversation", back_populates="user")

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
        }
