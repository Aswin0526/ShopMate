from flask import Flask, session, request, jsonify, Response
from datetime import timedelta, datetime
from flask_cors import CORS
import os
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_community.llms import Ollama
from langchain.chains import create_sql_query_chain
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
from pydantic import BaseModel
from dotenv import load_dotenv
import hashlib
import time
import uuid
from sentence_transformers import SentenceTransformer, util
import torch
import re
from chatwithsql import full_chain as sql_chain

model = SentenceTransformer('multi-qa-mpnet-base-cos-v1')

intents = {
    "SMALL_TALK": [
        "How are you?", "Who are you?", "Hello", "Good morning", "What's up",
        "Are you a robot?", "Nice to meet you", "Hey there", "Greetings",
        "Hope you are having a good day", "Bye", "Thank you"
    ],
    "DATA_QUERY": [
        "List out",
        "Quantity", "Stocks", "How many", "Do you have", "In stock", "price", "warranty", "image","model number","products", "shops"
        "How many books are in stock?", "Do you have 5 copies of Harry Potter?",
        "Is there any milk in the grocery section?", "Check electronics inventory",
        "How many red lipsticks are left?", "Are there any medium size t-shirts?",
        "List out all mobiles",
        "Price", "Cost", "How much", "Rate", "Amount", "Discount",
        "What is the price of this product?", "How much does the laptop cost?",
        "What is the rate for organic milk?", "Is there a discount on cosmetics?",
        "Price list for groceries", "Tell me the cost of this shirt",
        "How much for 10 units of eggs?", "What is the total price?",
       "I' m looking for a product LG Televisions in the store",
        "List all shops", "show me shops", "find stores", "available branches",
        "list of categories", "what types of products", "show all tables", 
        "list departments", "store locations", "show me all the outlets",

        "Where is this kept?", "Find the ID of this product", "Do you have warranty for this product", "model number of the product",
        "Which aisle is the grocery in?", "Product code for the electronics",

        "Quality", "Features", "Comparison", "Versus",
        "What are the specs of this laptop?", "Is this book hardcover?", 
        "Tell me about the material of this shirt", "What features does this have?",
        "What are the ingredients in this face cream?", "Is this milk organic?",
        "What is the battery life of these headphones?", "Does the dress have pockets?",
        "Is iPhone better than Samsung?", "Difference between organic and regular milk"
    ],
    "OUT_OF_DOMAIN": [
        "How do I write Python code?", "What is AI?", "Who won the football match?", 
        "Weather in London", "Translate this to Spanish", "Tell me a joke",
        "How to cook eggs", "Solve this math problem", "Who is the president?"
    ]
}

load_dotenv()

DATABASE_URL = f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
engine = create_engine(DATABASE_URL)

restricted_tables = ["customers", "orders", "order_items", "owners", "refresh_tokens", "wishlist"]
db = SQLDatabase(engine, sample_rows_in_table_info=0, ignore_tables=restricted_tables)

llm = Ollama(model="gemma3:4b", temperature=0)  # Using Ollama instead of Google Generative AI

def clean_sql(query):
    text = query if isinstance(query, str) else query.get("query", "")
    return re.sub(r"```(?:sql|postgresql)?\s*([\s\S]*?)\s*```", r"\1", text).strip()

execute_query_tool = QuerySQLDatabaseTool(db=db)

rules_text = """1. ONLY use the tables listed in metadata.
2. If a user asks for personal info (passwords, emails), DO NOT write SQL. Instead, respond with 'RESTRICTED_ACCESS'.
3. NEVER guess table or column names.
4. Keep the answer helpful but professional.
5. If the current question has enough data to process then go with it otherwise refer recent_history and answer


STRICT SCOPE RULES:
1. DEFAULT BEHAVIOR: Always filter your queries based on the assigned Shop, City, State, and Country provided above.
2. THE 'ANY' or "ALL" RULE: 
   - If Shop is 'Any' or 'all', you may query any shop within the assigned City.
   - If City is 'Any' or 'all', you may query any city within the assigned State.
   - If State is 'Any' or 'all', you may query any state within the assigned Country.
3. USER OVERRIDE: If the user explicitly mentions a DIFFERENT shop, city, or state in their question (e.g., "Check the branch in Madurai instead"), you are authorized to ignore the default scope and query the specific location requested by the user.
4. Keep your responses concise, helpful, and professional.
5. Do not mention the shop name or location if it is not the "ANY" OR "ALL" rule
"""

sql_system_rules = f"""You are a SQL expert that translates natural language to PostgreSQL.

### MANDATORY RULES - DO NOT DISOBEY:
1. **NO EQUALS FOR STRINGS**: NEVER use the `=` operator for text columns. You MUST use the `LIKE` operator with lower() and wildcards.
   - BAD: WHERE brand = 'LG'
   - GOOD: WHERE lower(brand) LIKE lower('%LG%')
2. **EXACT TABLES ONLY**: Only use table names from this list: {{table_info}}. 
   - If a table is not in that list, DO NOT CREATE ONE. 
   - Never combine words like 'electronics' and 'shop' into a new table name.
3. **SECURITY**: If the query touches 'refresh_tokens' or 'passwords', return 'RESTRICTED_ACCESS'.
4. **TOP_K**: Always use LIMIT {{top_k}} unless the user asks for a specific number.

### FORMATTING:
Return ONLY the raw SQL code. No markdown, no backticks, no explanations.
"""

sql_prompt = ChatPromptTemplate.from_messages([
    ("system", sql_system_rules),
    ("human", "{input}") 
])

answer_prompt = PromptTemplate(
    template="""You are a professional shop assistant. 

    - DO NOT use tables, bars (|), or asterisks (*) in your final response.
    - Use full sentences and natural language. 
    - (Example: Instead of "ID: 5 | Name: Shirt", say "We have a Shirt available, and its ID is 5.")
    - If the result is empty, politely inform the user that no records were found.
    - Do not mention technical terms like "SQL" or "Database" "server".

Rules: {rules}
Question: {question}
SQL Query: {query}
SQL Result: {result}
Answer: """,
    input_variables=["question", "query", "result"],
    partial_variables={"rules": sql_system_rules}
)

generate_query_chain = create_sql_query_chain(llm, db, prompt=sql_prompt)
rephrase_answer_chain = answer_prompt | llm | StrOutputParser()

def execute_and_clean(query_output):    
    raw_sql = clean_sql(query_output)
    print(raw_sql)
    if "RESTRICTED_ACCESS" in raw_sql:
        return "I am not authorized to access sensitive user data."
    return execute_query_tool.invoke(raw_sql)

full_chain = (
    RunnablePassthrough.assign(input=lambda x: x["question"])
    | RunnablePassthrough.assign(query=generate_query_chain) 
    | RunnablePassthrough.assign(
        result=lambda x: execute_and_clean(x["query"])
    )
    | rephrase_answer_chain
)

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=["*"] 
)

app.secret_key = "shopmate123"
app.permanent_session_lifetime = timedelta(hours=1)

RATE_LIMIT_SECONDS = 3 
last_request_time = datetime.min
last_request_text_hash = None

# Global chat sessions dictionary - managed by frontend session_id
chat_sessions = {}
SESSION_TIMEOUT = 3600 


def is_rate_limited(text):
    """Check if the request should be rate limited"""
    global last_request_time, last_request_text_hash
    
    current_time = datetime.now()
    text_hash = hashlib.md5(text.encode()).hexdigest()

    time_diff = (current_time - last_request_time).total_seconds()
    if time_diff < RATE_LIMIT_SECONDS:
        print(f"Rate limited: {time_diff:.2f}s since last request (minimum: {RATE_LIMIT_SECONDS}s)")
        return True
    
    if text_hash == last_request_text_hash:
        print("Rate limited: duplicate request detected")
        return True
    
    last_request_time = current_time
    last_request_text_hash = text_hash
    return False

def cleanup_old_sessions():
    current_time = time.time()
    sessions_to_remove = []
    
    for session_id, session_data in chat_sessions.items():
        last_active = session_data.get("last_active", 0)
        if current_time - last_active > SESSION_TIMEOUT:
            sessions_to_remove.append(session_id)
    
    for session_id in sessions_to_remove:
        del chat_sessions[session_id]
        print(f"Cleaned up inactive session: {session_id[:8]}...")
    
    return len(sessions_to_remove)

def get_session_data(session_id=None):
    """Get or create session data for current user using frontend-provided session_id"""
    if session_id is None:
        session_id = request.headers.get('X-Session-ID') or request.args.get('session_id')
    
    if not session_id:
        return None, str(uuid.uuid4())
    
    # Cleanup old sessions periodically
    if chat_sessions and len(chat_sessions) > 0:
        if hash(session_id) % 10 == 0:
            cleanup_old_sessions()
    
    if session_id not in chat_sessions:
        # Create new session with Ollama LLM (no persistent chat like Google AI)
        chat_sessions[session_id] = {
            "llm": Ollama(model="llama2", temperature=0),
            "chat_history": [],
            "shopName": None,
            "city": None,
            "state": None,
            "country": None,
            "productType": None,
            "shop_id": None,
            "last_active": time.time()
        }
    else:
        # Update last active time
        chat_sessions[session_id]["last_active"] = time.time()
    
    return chat_sessions[session_id], session_id

def get_general_instruction(session_data=None):
    """Generate general instruction based on session data"""
    if session_data is None:
        session_data, _ = get_session_data()
    
    shopName = session_data.get("shopName", "Unknown Shop") if session_data else "Unknown Shop"
    city = session_data.get("city", "Unknown City") if session_data else "Unknown City"
    state = session_data.get("state", "Unknown State") if session_data else "Unknown State"
    country = session_data.get("country", "Unknown Country") if session_data else "Unknown Country"
    productType = session_data.get("productType", "all products") if session_data else "all products"
    
    return f"""You are a professional retail assistant for ShopMate.
Your primary assignment is for the shop '{shopName}' located in {city}, {state}, {country}.
This shop specializes in {productType}. """

def get_recent_history(chat_history, count=3):
    """Get recent chat history messages"""
    return chat_history[-count:] if len(chat_history) > count else chat_history

def format_history_for_context(chat_history):
    recent_history = get_recent_history(chat_history)
    if not recent_history:
        return ""
    
    formatted = "\nRecent conversation:\n"
    print(recent_history)
    for i, item in enumerate(recent_history, 1):
        question = item.get("content", "")
        response = item.get("response", "")
        formatted += f"{i}. User: {question}\n   Assistant: {response}\n"
    return formatted

@app.route("/start-chat", methods=["POST"])
def start_chat():
    """Initialize a new chat session for a user"""
    print("in")
    data = request.get_json()
    
    session_id = (request.headers.get('X-Session-ID') or 
                  request.args.get('session_id') or 
                  (data.get("session_id") if data else None))
    
    if not session_id:
        session_id = str(uuid.uuid4())
    
    session_data, returned_session_id = get_session_data(session_id)
    if session_data is None:
        session_data, returned_session_id = get_session_data()
    
    form_data = data.get("formData", {})
    session_data["shopName"] = form_data.get("shopName")
    session_data["city"] = form_data.get("city")
    session_data["state"] = form_data.get("state")
    session_data["country"] = form_data.get("country")
    session_data["productType"] = form_data.get("productType")
    session_data["shop_id"] = form_data.get("shopId")
    session_data["chat_history"] = []
    
    print(f"Session started for {session_data.get('shopName')} in {session_data.get('city')}")
    print(f"Session ID: {returned_session_id}")
    print(f"Total active sessions: {len(chat_sessions)}")
    
    # Return session_id to frontend for storage
    return jsonify({
        "message": "Chat session started",
        "session_id": returned_session_id,
        "shop": session_data.get("shopName"),
        "location": f"{session_data.get('city')}, {session_data.get('state')}, {session_data.get('country')}"
    })

@app.route("/get-session", methods=["GET"])
def get_session():
    """Get current session data"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id})
    
    return jsonify({
        "session_id": session_id,
        "shopName": session_data.get("shopName"),
        "city": session_data.get("city"),
        "state": session_data.get("state"),
        "country": session_data.get("country"),
        "productType": session_data.get("productType"),
        "shop_id": session_data.get("shop_id"),
        "chat_history_count": len(session_data.get("chat_history", [])),
        "active_sessions": len(chat_sessions)
    })

@app.route("/sessions/status", methods=["GET"])
def sessions_status():
    """Get status of all active sessions (for debugging)"""
    return jsonify({
        "total_sessions": len(chat_sessions),
        "session_timeout": SESSION_TIMEOUT,
        "sessions": {
            sid[:8] + "...": {
                "shop": data.get("shopName"),
                "city": data.get("city"),
                "history_count": len(data.get("chat_history", [])),
                "last_active": datetime.fromtimestamp(data.get("last_active", 0)).isoformat()
            }
            for sid, data in chat_sessions.items()
        }
    })

def get_intent(user_text):
    """Classify user intent using sentence embeddings"""
    user_vec = model.encode(user_text, convert_to_tensor=True)
    
    best_intent = None
    highest_score = 0
    
    for intent_name, examples in intents.items():
        example_vecs = model.encode(examples, convert_to_tensor=True)
        scores = util.cos_sim(user_vec, example_vecs)
        max_score = torch.max(scores).item()
        
        if max_score > highest_score:
            highest_score = max_score
            best_intent = intent_name
            
    if highest_score < 0.45:
        return "OUT_OF_DOMAIN", highest_score
        
    return best_intent, highest_score

def small_talk(question):
    session_data, session_id = get_session_data()
    if session_data is None:
        return "Please start a chat session first by calling /start-chat"
    
    chat_history = session_data.get("chat_history", [])
    llm_instance = session_data.get("llm")
    
    general_instruction = get_general_instruction(session_data)
    
    context = format_history_for_context(chat_history)
    
    if context:
        prompt = f"{general_instruction}\n\n{context}\nUser: {question}\nAssistant:"
    else:
        prompt = f"{general_instruction}\n\nUser: {question}\nAssistant:"
    print("prompt", prompt)
    try:
        response = llm_instance(prompt)
        message = response
        
        # Update chat history
        session_data["chat_history"].append({
            "role": "user",
            "content": question,
            "response": message
        })
        
        return message
    except Exception as e:
        print(f"Error in small_talk: {e}")
        return "I'm sorry, I encountered an error. Could you please try again?"

def out_of_domain(question):
    session_data, session_id = get_session_data()
    if session_data is None:
        return "Please start a chat session first by calling /start-chat"
    
    chat_history = session_data.get("chat_history", [])
    llm_instance = session_data.get("llm")
    
    general_instruction = get_general_instruction(session_data)

    context = format_history_for_context(chat_history)

    shopName = session_data.get("shopName", "our store")
    city = session_data.get("city", "")
    
    if context:
        redirect_prompt = f"{general_instruction}\n\n{context}\nUser: {question}\n\nAs a professional retail assistant for {shopName} in {city}, politely explain that you can only help with shop-related topics like:\n- Product availability and prices\n- Stock information and warranties\n- Product features and comparisons\n- Store policies and services\n\nThen invite them to ask about our products or services.\nAssistant:"
    else:
        redirect_prompt = f"{general_instruction}\n\nUser: {question}\n\nAs a professional retail assistant for {shopName} in {city}, politely explain that you can only help with shop-related topics like:\n- Product availability and prices\n- Stock information and warranties\n- Product features and comparisons\n- Store policies and services\n\nThen invite them to ask about our products or services.\nAssistant:"
    print("prompt", redirect_prompt)
    try:
        response = llm_instance(redirect_prompt)
        message = response

        return message
    except Exception as e:
        print(f"Error in out_of_domain: {e}")
        return f"I'm here to help you with {session_data.get('shopName', 'our store')}! Please ask me about our products, prices, or any other shop-related questions."

def data_query(question):
    """Handle data queries using SQL database with context"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return "Please start a chat session first by calling /start-chat"
    
    chat_history = session_data.get("chat_history", [])

    shopName = session_data.get("shopName", "Unknown")
    city = session_data.get("city", "Unknown")
    state = session_data.get("state", "Unknown")
    country = session_data.get("country", "Unknown")
    productType = session_data.get("productType", "all products")
    shop_id = session_data.get("shop_id")

    recent_history = get_recent_history(chat_history, 3)
    recent_questions = [item.get("content", "") for item in recent_history if item.get("role") == "user"]

    chain_input = {
    "question": question, # This maps to {question} or {input}
    "shopName": shopName,
    "city": city,
    "state": state,
    "country": country,
    "productType": productType,
    "shop_id": shop_id,
    "recent history": recent_questions
    }

    try:
        response = full_chain.invoke(chain_input)
        print(response)
        message = response
        
        session_data["chat_history"].append({
            "role": "user",
            "content": question,
            "response": message,
            "query_type": "data_query"
        })
        
        return message
    except Exception as e:
        print(f"Error in data_query: {e}")
        return f"I encountered an issue while checking our database. Please try rephrasing your question about {productType} at {shopName}."

class TranscriptRequest(BaseModel):
    text: str


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """Main endpoint for processing user voice/text input"""
    data = request.get_json()
    text = data.get("text", "")

    if not text or not text.strip():
        print("Rejected: empty transcript")
        return jsonify({"error": "Empty transcript"}), 400
    
    text = text.strip()

    if is_rate_limited(text):
        print(f"Request rate limited for transcript: '{text[:50]}...'")
        return jsonify({
            "error": "Rate limited",
            "message": "Please wait before sending another request"
        }), 429

    print("Processing transcript:", text)
    intent, confidence = get_intent(text)
    print(f"Detected intent: {intent} (confidence: {confidence:.2f})")

    if intent == "DATA_QUERY":
        response_text = data_query(text)
    elif intent == "OUT_OF_DOMAIN":
        response_text = out_of_domain(text)
    else:
        response_text = small_talk(text)

    print(response_text)
    
    print("\n" + "="*80)
    print("ACTIVE CHAT SESSIONS")
    print("="*80)
    print(f"Total Sessions: {len(chat_sessions)}")
    print("-"*80)
    
    for sid, data in chat_sessions.items():
        print(f"\nSession ID: {sid}")
        print(f"  Shop: {data.get('shopName', 'N/A')}")
        print(f"  Location: {data.get('city', 'N/A')}, {data.get('state', 'N/A')}, {data.get('country', 'N/A')}")
        print(f"  Product Type: {data.get('productType', 'N/A')}")
        print(f"  Shop ID: {data.get('shop_id', 'N/A')}")
        print(f"  Chat History Count: {len(data.get('chat_history', []))}")
        print(f"  Last Active: {datetime.fromtimestamp(data.get('last_active', 0)).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"  LLM Object: {'Active' if data.get('llm') else 'None'}")
        
        # Print recent chat history
        chat_history = data.get("chat_history", [])
        if chat_history:
            print(f"  Recent Messages:")
            for i, msg in enumerate(chat_history[-3:], 1):  # Last 3 messages
                role = msg.get("role", "unknown")
                content = msg.get("content", "")[:100]  # First 100 chars
                response = msg.get("response", "")[:100] if msg.get("response") else "No response"
                print(f"    {i}. [{role}] Q: {content}...")
                print(f"       A: {response}...")
        
        print("-"*80)
    
    print(f"\nMemory Usage: ~{len(chat_sessions) * 50} KB (estimated)")
    print("="*80 + "\n")

    print("final response", response_text)
    return jsonify({
        "text": response_text
    })
    

@app.route("/transcribe/status", methods=["GET"])
def transcribe_status():
    """Get rate limiting status"""
    current_time = datetime.now()
    time_diff = (current_time - last_request_time).total_seconds()
    cooldown = max(0, RATE_LIMIT_SECONDS - time_diff)
    
    return jsonify({
        "rate_limited": time_diff < RATE_LIMIT_SECONDS,
        "cooldown_seconds": cooldown,
        "min_interval": RATE_LIMIT_SECONDS
    })

@app.route("/clear-chat", methods=["POST"])
def clear_chat():
    """Clear chat history for current session"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"})
    
    session_data["chat_history"] = []
    
    return jsonify({"message": "Chat history cleared and session reset"})

@app.route("/chat-history", methods=["GET"])
def get_chat_history():
    """Get chat history for current session"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id})
    
    chat_history = session_data.get("chat_history", [])
    return jsonify({
        "session_id": session_id,
        "chat_history": chat_history,
        "count": len(chat_history)
    })

@app.route("/cleanup-sessions", methods=["POST"])
def cleanup_sessions():
    """Manually trigger session cleanup"""
    count = cleanup_old_sessions()
    return jsonify({
        "message": f"Cleaned up {count} inactive sessions",
        "remaining_sessions": len(chat_sessions)
    })

@app.route("/", methods=["GET"])
def health():
    print("🔥 HIT /")
    return "Flask is reachable", 200

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000, debug=False)
