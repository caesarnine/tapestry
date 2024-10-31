import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional

import jwt
import openai
from anthropic import AsyncAnthropic, AsyncAnthropicBedrock
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from lxml import html
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    Conversation,
    Document,
    Message,
    User,
    WebSocketMessage,
)

load_dotenv()

azure_openai_api_key = os.getenv("AZURE_OPENAI_API_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")

if azure_openai_api_key:
    openai_client = openai.AsyncAzureOpenAI(api_key=azure_openai_api_key, azure_endpoint="https://seq-scge.openai.azure.com/", api_version='2024-08-01-preview') # type: ignore
    openai_model = "scge-gpt-4o-mini"
else:
    openai_client = openai.AsyncOpenAI(api_key=openai_api_key)
    openai_model = "gpt-4o-mini"

if anthropic_api_key:
    anthropic_client = AsyncAnthropic(api_key=anthropic_api_key)
    anthropic_model = "claude-3-5-sonnet-20240620"

else:
    anthropic_client = AsyncAnthropicBedrock()
    anthropic_model = "anthropic.claude-3-5-sonnet-20240620-v1:0"

router = APIRouter()
logger = logging.getLogger(__name__)

# Add these constants for JWT
SECRET_KEY = "your-secret-key"  # Change this to a secure random string
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, conversation_id: str, user_id: str, db: Session):
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = {}
        self.active_connections[conversation_id][user_id] = websocket
        
        # Fetch and send conversation history
        await self.send_conversation_history(conversation_id, user_id, db)

    def disconnect(self, conversation_id: str, user_id: str):
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].pop(user_id, None)
            if not self.active_connections[conversation_id]:
                self.active_connections.pop(conversation_id, None)

    async def send_message(self, conversation_id: str, message: str, db: Session):
        if conversation_id in self.active_connections:
            for websocket in self.active_connections[conversation_id].values():
                await websocket.send_text(message)
            
            # Store outgoing message
            websocket_message = WebSocketMessage(
                conversation_id=conversation_id,
                message_type="system",
                content=message
            )
            db.add(websocket_message)
            db.commit()

    async def send_conversation_history(self, conversation_id: str, user_id: str, db: Session):
        messages = db.query(Message)\
            .filter(Message.conversation_id == conversation_id)\
            .order_by(Message.created_at)\
            .all()
        
        filtered = [
            m for m in messages if 
            m.role not in ['user', 'assistant'] or 
            any(content.get('type') == 'text' for content in m.content)
        ]

        history_message = {
            "type": "conversation_history",
            "content": [m.to_dict() for m in filtered]
        }

        if conversation_id in self.active_connections and user_id in self.active_connections[conversation_id]:
            await self.active_connections[conversation_id][user_id].send_text(json.dumps(history_message))

websocket_manager = WebSocketManager()

class ChatManager:
    def __init__(self):
        pass

    def get_history(self, db: Session, conversation_id: str) -> List[Dict]:
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.role.in_(['user', 'assistant'])
        ).order_by(Message.created_at).all()
        return [self.format_message_for_claude(message.to_dict()) for message in messages]

    def format_message_for_claude(self, message: Dict) -> Dict:
        return {
            "role": message["role"],
            "content": message["content"]
        }

    def add_message(self, db: Session, conversation_id: str, message: Dict):
        new_message = Message(
            conversation_id=conversation_id,
            role=message["role"],
            content=message["content"]
        )
        db.add(new_message)
        db.commit()

    def clear_history(self, db: Session, conversation_id: str):
        db.query(Message).filter(Message.conversation_id == conversation_id).delete()
        db.commit()
        

chat_manager = ChatManager()

class DocumentStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    ERROR = "error"

async def stream_response(client: AsyncAnthropicBedrock | AsyncAnthropic, messages: List[Dict], system_prompt: str, tools: List[Dict]) -> AsyncGenerator[str, None]:
    stream = client.messages.stream(
        model=anthropic_model,
        max_tokens=8096,
        system=system_prompt,
        messages=messages,
        tools=tools
    )

    current_text = ""
    current_tool_use = None
    partial_json = ""

    async with stream as response:
        async for event in response:
            if event.type == "content_block_start":
                if event.content_block.type == "text":
                    current_text = event.content_block.text or ""
                elif event.content_block.type == "tool_use":
                    current_tool_use = {
                        "id": event.content_block.id,
                        "name": event.content_block.name,
                        "input": {}
                    }
                    partial_json = ""
            elif event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    current_text += event.delta.text
                    yield event.delta.text
                elif event.delta.type == "input_json_delta":
                    partial_json += event.delta.partial_json
            elif event.type == "content_block_stop":
                if current_tool_use:
                    try:
                        current_tool_use["input"] = json.loads(partial_json)
                        yield json.dumps({"tool_use": current_tool_use})
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse tool input JSON: {partial_json}")
                        yield json.dumps({"error": "Failed to parse tool input"})
                    current_tool_use = None
                    partial_json = ""
                current_text = ""
            elif event.type == "message_delta":
                if event.delta.stop_reason == "tool_use":
                    return  # Stop streaming to handle tool use

async def analyze_single_document(document: Dict, user_question: str, conversation_id: str, db: Session) -> tuple[str, Dict]:
    try:
        # Send in_progress status
        await websocket_manager.send_message(conversation_id, json.dumps({
            "type": "document_analysis",
            "status": DocumentStatus.IN_PROGRESS.value,
            "document_id": document['document_id'],
            "document_date": document['document_date'].strftime("%Y-%m-%d"),
            "document_filename": document['document_filename'],
        }), db)

        logger.info(f"Analyzing document: {document}")

        prompt = f"""
        You are a extraction agent in a multi-agent system.
        Your goal is to extract text from the document that is relevant to the user's question.
        The larger system will use your output as well as other subagent outputs to form a complete response.

        <document>
        <document_date>{document['document_date']}</document_date>
        <document_content>{document['content']}</document_content>
        <document_tags>{document['document_tags']}</document_tags>
        </document>

        <user_question>
        {user_question}
        </user_question>

        <output>
        <thinking>
        [your thoughts here]
        </thinking>
        <citations>
        <citation>
        <text>
        [verbatim text from the document]
        </text>
        <explanation>
        [explanation of why the citation is relevant to the user's question]
        </explanation>
        <relevance_score>
        [relevance score between 1 and 10, 1 is not relevant, 10 is completely relevant]
        </relevance_score>
        <context>
        [short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk]
        </context>
        </citation>
        <citation>
        <text>
        [verbatim text from the document]
        </text>
        <explanation>
        [explanation of why the citation is relevant to the user's question, keeping the context of the citation in mind]
        </explanation>
        <relevance_score>
        [relevance score between 1 and 10, 1 is not relevant, 10 is completely relevant]
        </relevance_score>
        <context>
        [short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk]
        </context>
        </citation>
        ...
        </citations>
        </output>
        
        <instructions>
        - The goal is to extract text verbatim from the document that could help answer the user's question.
        - Think about what you are going to do in a <thinking> tag first.
        - Pay attention to context. If the citation isn't from an authoritative source then mention it in the <explanation> tag. (For example, if the citation is from a analyst asking a question, then it's not authoritative.)
        - Extract text verbatim from the document that is relevant to the user's question. The text should match the document exactly, including punctuation, capitalization, and spacing. Do not truncate sentences or phrases when extracting text.
        - Include enough context in the <text> tag such that each citation is understandable on its own. Extract several sentences before and after the citation to provide context.
        - Include a short explanation of why the citation is relevant to the user's question in the <explanation> tag.
        - Include a short context in the <context> tag to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk.
        - If no citations are found, return an empty <citation> element.
        </instructions>
        """.strip()

        response = await openai_client.chat.completions.create(
            model=openai_model,
            messages=[
                {"role": "user", "content": prompt},
            ],
        )
        
        response_content = response.choices[0].message.content

        result = f"""
<response>
<document_id>{document['document_id']}</document_id>
<document_date>{document['document_date']}</document_date>
{response_content}
</response>
""".strip()

        logger.info(f"Completed analysis for: {document['document_id']} ({document['document_date']})")

        # Send complete status
        await websocket_manager.send_message(conversation_id, json.dumps({
            "type": "document_analysis",
            "status": DocumentStatus.COMPLETE.value,
            "document_id": document['document_id'],
            "document_date": document['document_date'].strftime("%Y-%m-%d"),
            "document_filename": document['document_filename'],
        }), db)

        return result, document

    except Exception as e:
        # Send error status
        await websocket_manager.send_message(conversation_id, json.dumps({
            "type": "document_analysis",
            "status": DocumentStatus.ERROR.value,
            "document_id": document['document_id'],
            "document_date": document['document_date'].strftime("%Y-%m-%d"),
            "document_filename": document['document_filename'],
            "error": str(e)
        }), db)
        raise

def extract_citations_from_response(response: str, document: Dict) -> list[dict]:
    citations = []
    try:
        root = html.fromstring(response)
        document_id = document['document_id']
        document_date = document['document_date'].strftime("%Y-%m-%d")  
        document_tags = document['document_tags']
        document_filename = document['document_filename']
        for citation in root.findall('.//citation'):
            text = citation.find('text').text if citation.find('text') is not None else ''
            explanation = citation.find('explanation').text if citation.find('explanation') is not None else ''
            citation_dict = {
                "id": hashlib.sha256(f"{document_id}-{text}".encode()).hexdigest()[:5],
                "text": text,
                "explanation": explanation,
                "document_id": document_id,
                "document_date": document_date,
                "document_tags": document_tags,
                "document_filename": document_filename
            }
            # Skip empty citations
            if not text:
                continue
            citations.append(citation_dict)
    except Exception as e:
        print(f"Error parsing XML: {e}")
        print(f"Response: {response}")
    return citations

def format_citations_output(citations: list[dict]) -> str:
    grouped_citations = {}
    for citation in citations:
        key = (citation['document_id'])
        if key not in grouped_citations:
            grouped_citations[key] = []
        grouped_citations[key].append(citation)

    output = ""

    for key, citations in grouped_citations.items():
        sorted_citations = sorted(citations, key=lambda x: x['document_date'], reverse=True)
        grouped_citations[key] = sorted_citations

    output += "<results>\n"
    for key, citations in grouped_citations.items():
        output += "<document_result>\n"
        output += f"<document_id>{key}</document_id>\n"
        output += f"<document_date>{citations[0]['document_date']}</document_date>\n"
        output += f"<document_filename>{citations[0]['document_filename']}</document_filename>\n"
        for citation in citations:
            output += "<citation>\n"
            output += f"<id>{citation['id']}</id>\n"
            output += f"<text>{citation['text']}</text>\n"
            output += f"<explanation>{citation['explanation']}</explanation>\n"
            output += "</citation>\n"
        output += "</citations>\n"
        output += "</document_result>\n"
    output += "</results>\n"

    print(output)

    return output
    
    

async def analyze_documents(user_question: str, context: Dict[str, Any], db: Session, conversation_id: str) -> str:
    print(context)
    selected_tags = context.get('selectedTags', [])
    selected_documents = context.get('selectedDocuments', [])

    # Start with a base query
    query = db.query(Document)
    
    if selected_tags:
        query = query.filter(Document.tags.in_(selected_tags))
    if selected_documents:
        query = query.filter(Document.id.in_([doc['id'] for doc in selected_documents]))

    # Add ordering
    query = query.order_by(Document.date.desc())

    # Execute the query
    documents = query.all()

    print(f"Number of documents found: {len(documents)}")
    for doc in documents:
        print(f"Document ID: {doc.id}, Snippet: {doc.content[:100]}")

    if not documents:
        await websocket_manager.send_message(conversation_id, json.dumps({
            "type": "document_analysis",
            "status": "no_documents_found"
        }), db)
        return "No documents found for the selected criteria."

    # Prepare the document data for analysis
    document_data = [
        {
            "document_id": doc.id,
            "document_date": doc.date,
            "content": doc.content,
            "document_tags": doc.tags,
            "document_filename": doc.document_filename
        }
        for doc in documents
    ]

    total_documents = len(document_data)
    logger.info(f"Total documents to analyze: {total_documents}")

    # Modify the initial status message
    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "document_analysis",
        "status": "start",
        "total_documents": total_documents,
        "documents": [
            {
                "document_filename": doc['document_filename'],
                "document_id": doc['document_id'],
                "document_tags": doc['document_tags'],
                "status": DocumentStatus.PENDING.value
            }
            for doc in document_data
        ]
    }), db)

    # Analyze each document concurrently
    analysis_tasks = [analyze_single_document(doc, user_question, conversation_id, db) for doc in document_data]
    analysis_results = await asyncio.gather(*analysis_tasks)

    completed_documents = len(analysis_results)
    logger.info(f"Completed documents: {completed_documents}")

    all_citations = []

    for result, document in analysis_results:
        citations = extract_citations_from_response(result, document)
        all_citations.extend(citations)

    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "document_analysis_complete",
        "status": "complete",
        "total_documents": total_documents,
        "completed_documents": completed_documents
    }), db)

    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "citations",
        "citations": all_citations
    }), db)

    complete_document_analysis = {
        "type": "document_analysis",
        "status": 'complete',
        "total_documents": total_documents,
        "completed_documents": completed_documents,
        "documents": [
            {
                "document_filename": doc['document_filename'],
                "document_id": doc['document_id'],
                "document_tags": doc['document_tags'],
                "status": DocumentStatus.COMPLETE.value
            }
            for doc in document_data
        ],
        "citations": all_citations
    }

    await websocket_manager.send_message(conversation_id, json.dumps(complete_document_analysis), db)

    chat_manager.add_message(db, conversation_id, {
        "role": "document_analysis",
        "content": complete_document_analysis
    })

    return format_citations_output(all_citations)

async def handle_tool_call(tool_call: Dict, context: Dict, db: Session, conversation_id: str) -> Dict:
    tool_name = tool_call['name']
    tool_input = tool_call['input']
    
    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "tool_call_start",
        "tool_name": tool_name,
        "tool_input": tool_input
    }), db)
    
    try:
        if tool_name == "analyze_documents":
            citations = await analyze_documents(tool_input['user_question'], context, db, conversation_id)
            tool_result = {
                "tool_use_id": tool_call['id'],
                "content": citations,
                "is_error": False
            }
        else:
            tool_result = {
                "tool_use_id": tool_call['id'],
                "content": f"Unknown tool called: {tool_name}",
                "is_error": True
            }
    except Exception as e:
        print(e)
        tool_result = {
            "tool_use_id": tool_call['id'],
            "content": f"Error executing tool {tool_name}: {str(e)}",
            "is_error": True
        }
    
    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "tool_call_end",
        "tool_name": tool_name,
        "tool_result": tool_result
    }), db)
    
    return tool_result

async def process_message(message: str, context: Dict[str, Any], db: Session, conversation_id: str) -> None:
    print(context)

    selected_tags = context.get('selectedTags', [])
    selected_documents = context.get('selectedDocuments', [])

    instruction_facts = """
- Compress key factual information from the citations, as well as useful background information which may not be in the citations, into a list of core factual points to reference.
    - For this step do not draw any conclusions, perform any analysis, or make any judgements.
    - Place this section of your response under the #### Facts heading.
    - Use inline <citation> tags to cite your sources and include all relevant citations.
    - Remember there can be multiple citations to back a claim.
    - Use markdown formatting.
    """.strip()

    instruction_thinking = """
- Think step by step about how to best answer the user's question.
    - Put all thoughts under the #### Thinking Step <number> heading. There should be a new thinking section for each step of your reasoning.
    - Use additional tool calls if needed to answer the user's question.
    - Use inline <citation> tags to cite your sources and include all relevant citations.
    - Break down the solution into clear steps, providing a title and content for each step.
    - After each step, decide if you need another step or if you're ready to give the final answer.
    - Continuously adjust your reasoning based on intermediate results and reflections, adapting your strategy as you progress.
    - Regularly evaluate your progress, being critical and honest about your reasoning process.
    - Assign a quality score between 0.0 and 1.0 to guide your approach. Be critical and honest with your score.
        - 0.8+: Continue current approach
        - 0.5-0.7: Consider minor adjustments
        - Below 0.5: Seriously consider backtracking and trying a different approach
    - If unsure or if your score is low, backtrack and try a different approach, explaining your decision.
    - For mathematical problems, show all work explicitly using LaTeX for formal notation and provide detailed proofs.
    - Explore multiple solutions individually if possible, comparing approaches in your reflections.
    - Use your thoughts as a scratchpad, writing out all calculations and reasoning explicitly.
    - Be aware of your limitations as an AI and what you can and cannot do.
    - After every 3 steps, perform a detailed self-reflection on your reasoning so far, considering potential biases and alternative viewpoints.
    """.strip()

    instruction_answer = """
- Output your final answer under the #### Answer heading.
    - Be temporally consistent. For example it's inconsistent to cite a document from 2023 to back up an answer about current trends.
    - Use inline <citation> tags to cite your sources.
    - Include all relevant citations for any claims made, it's ok to have multiple citations for a single claim.
    - Use markdown formatting for your answer.
    - Be unbiased and objective. The goal is to provide the best answer possible, not to paint a particular company in a positive or negative light.
    """.strip()

    example_output_if_reasoning_mode = """
#### Facts
[list of facts]
- [fact 1] <citation id="[citation_id]" />
- [fact 2] <citation id="[citation_id]" />
...

#### Thinking Step 1 - [title of step]
[thoughts and reasoning for step]

#### Thinking Step 2 - [title of step]
[thoughts and reasoning for step]

...

#### Thinking Step n - [title of step]
[thoughts and reasoning for step]

#### Answer
[final answer with citations, formatted with markdown]
    """.strip()

    example_output_if_not_reasoning_mode = """
#### Facts
[list of facts]
- [fact 1] <citation id="[citation_id]" />
- [fact 2] <citation id="[citation_id]" />
...

#### Answer
[final answer with citations, formatted with markdown]
    """.strip()

    if context.get('reasoningMode', False):
        instruction = f"{instruction_facts}\n{instruction_thinking}\n{instruction_answer}"
        example_output = example_output_if_reasoning_mode
    else:
        instruction = f"{instruction_facts}\n{instruction_answer}"
        example_output = example_output_if_not_reasoning_mode
    
    system_prompt = f"""
You are an expert research AI assistant.
You are embedded in a research tool that allows users to upload and query documents, with a left sidebar that allows the user to select the documents to query or filter the documents.

<citation_instructions>
- Include inline citations in the <citation id="id" /> format.
- The id should correspond to the ids from the tool call response.
- The id should be a unique identifier for the citation.
- There can be multiple citations to back a claim. Include all citations that support the claim.
</citation_instructions>

<user_selections>
    <selected_tags>{selected_tags}</selected_tags>
    <selected_documents>{selected_documents}</selected_documents>
    <reasoning_mode>{context.get('reasoningMode', False)}</reasoning_mode>
</user_selections>

<example_inline_citation>
    <example>
    Apple reported revenue growth this quarter. <citation id="[first_citation_id]" /> However, challenges remain in the supply chain. <citation id="[second_citation_id]" />
    </example>
    <example>
    Google reported revenue growth this quarter. <citation id="[first_citation_id]" /> <citation id="[second_citation_id]" /> However, challenges remain in the supply chain. <citation id="[third_citation_id]" />
    </example>
</example_inline_citation>

<current_date>{datetime.now().strftime("%Y-%m-%d")}</current_date>

<instructions>
{instruction}
</instructions>

<example_output>
{example_output}
</example_output>
""".strip()
    
    print(system_prompt)

    tools = [
        {
            "name": "analyze_documents",
            "description": "Analyze the documents to answer the user's question",
            "input_schema": {
                "type": "object",
                "properties": {
                    "user_question": {"type": "string", "description": "The user's question input verbatim."},
                },
                "required": ["user_question"]
            }
        },
    ]

    chat_manager.add_message(db, conversation_id, {"role": "user", "content": [{"type": "text", "text": message}]})
    
    assistant_message = {"role": "assistant", "content": []}
    current_text = ""

    while True:
        messages = chat_manager.get_history(db, conversation_id)
        async for chunk in stream_response(anthropic_client, messages, system_prompt, tools):
            chunk_data = json.loads(chunk) if chunk.startswith('{') else {"text": chunk}
            
            if "text" in chunk_data:
                current_text += chunk_data["text"]
                structured_text = json.dumps({
                    "type": "assistant_message",
                    "content": chunk_data["text"]
                })
                await websocket_manager.send_message(conversation_id, structured_text, db)
            elif "tool_use" in chunk_data:
                if current_text:
                    assistant_message["content"].append({"type": "text", "text": current_text})
                    current_text = ""
                
                tool_call = chunk_data["tool_use"]
                assistant_message["content"].append({
                    "type": "tool_use",
                    "id": tool_call["id"],
                    "name": tool_call["name"],
                    "input": tool_call["input"]
                })
                
                chat_manager.add_message(db, conversation_id, assistant_message)
                
                tool_result = await handle_tool_call(tool_call, context, db, conversation_id)
                
                chat_manager.add_message(db, conversation_id, {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_result["tool_use_id"],
                            "content": tool_result["content"],
                            "is_error": tool_result["is_error"]
                        }
                    ]
                })


                
                assistant_message = {"role": "assistant", "content": []}
                break
        else:
            if current_text:
                assistant_message["content"].append({"type": "text", "text": current_text})
            chat_manager.add_message(db, conversation_id, assistant_message)
            break

    await websocket_manager.send_message(conversation_id, json.dumps({
        "type": "end_of_response"
    }), db)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/conversations")
async def create_conversation(
    title: str = "New Conversation",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"Creating new conversation: {title} for user {current_user.id}")
    new_conversation = Conversation(title=title, user_id=current_user.id)
    db.add(new_conversation)
    db.commit()
    db.refresh(new_conversation)
    logger.info(f"New conversation created: {new_conversation.id}")
    return new_conversation.to_dict()

@router.get("/conversations")
async def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conversations = db.query(Conversation).filter(Conversation.user_id == current_user.id).order_by(Conversation.updated_at.desc()).all()
    return [conversation.to_dict() for conversation in conversations]

@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation.to_dict()

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conversation)
    db.commit()
    return {"message": "Conversation deleted successfully"}

class TitleUpdate(BaseModel):
    title: str

@router.put("/conversations/{conversation_id}/title")
async def update_conversation_title(
    conversation_id: int,
    title_update: TitleUpdate = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"Received title update request for conversation {conversation_id}: {title_update.dict()}")
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation.title = title_update.title
    db.commit()
    db.refresh(conversation)
    return conversation.to_dict()

@router.post("/register")
async def register_user(username: str, email: str, password: str, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_user = db.query(User).filter(User.email == email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(password)
    new_user = User(username=username, email=email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user.to_dict()

@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: str = None,
    db: Session = Depends(get_db),
    token: str = Query(None)
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        current_user = await get_current_user(token, db)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if conversation_id == "null":
        new_conversation = Conversation(title="New Conversation", user_id=current_user.id)
        db.add(new_conversation)
        db.commit()
        db.refresh(new_conversation)
        conversation_id = str(new_conversation.id)

    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket_manager.connect(websocket, conversation_id, str(current_user.id), db)
    try:
        # Send the conversation ID to the client
        await websocket.send_json({"type": "conversation_created", "id": conversation_id})

        while True:
            data = await websocket.receive_json()
            
            # Store incoming message
            websocket_message = WebSocketMessage(
                conversation_id=conversation_id,
                message_type="user",
                content=json.dumps(data)
            )
            db.add(websocket_message)
            db.commit()

            message = data['message']
            context = data['context']
            
            await process_message(message, context, db, conversation_id)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Error in WebSocket: {str(e)}")
    finally:
        websocket_manager.disconnect(conversation_id, str(current_user.id))

