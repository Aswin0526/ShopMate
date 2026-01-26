from flask import Flask, session, request, jsonify, Response
from datetime import timedelta, datetime
from flask_cors import CORS
import google.generativeai as genai
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import GoogleGenerativeAI
import os
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.play import play
import hashlib
import time
import uuid
from sentence_transformers import SentenceTransformer, util
import torch
from chatwithsql import full_chain as sql_chain

model = SentenceTransformer('all-mpnet-base-v2')

intents = {
    "SMALL_TALK": [
        "How are you?", "Who are you?", "Hello", "Good morning", "What's up",
        "Are you a robot?", "Nice to meet you", "Hey there", "Greetings",
        "Hope you are having a good day", "Bye", "Thank you"
    ],
    "DATA_QUERY": [
        "Quantity", "Stocks", "How many", "Do you have", "In stock", "price", "warranty", "image","model number","products", "shops"
        "How many books are in stock?", "Do you have 5 copies of Harry Potter?",
        "Is there any milk in the grocery section?", "Check electronics inventory",
        "How many red lipsticks are left?", "Are there any medium size t-shirts?",
        
        "Price", "Cost", "How much", "Rate", "Amount", "Discount",
        "What is the price of this product?", "How much does the laptop cost?",
        "What is the rate for organic milk?", "Is there a discount on cosmetics?",
        "Price list for groceries", "Tell me the cost of this shirt",
        "How much for 10 units of eggs?", "What is the total price?",

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

client = ElevenLabs(
    api_key=os.getenv("ELEVENLABS_API_KEY")
)

GEMENI_API_KEY = os.getenv("GEMENI_API_KEY")

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=["*"]  # Allow all origins for frontend to manage session
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
    """Remove sessions inactive for more than SESSION_TIMEOUT"""
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
        # Create new session with client and chat objects
        chat_sessions[session_id] = {
            "client": genai.Client(api_key=GEMENI_API_KEY),
            "chat": None,
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
This shop specializes in {productType}.

STRICT SCOPE RULES:
1. DEFAULT BEHAVIOR: Always filter your queries based on the assigned Shop, City, State, and Country provided above.
2. THE 'ANY' RULE: 
   - If Shop is 'Any', you may query any shop within the assigned City.
   - If City is 'Any', you may query any city within the assigned State.
   - If State is 'Any', you may query any state within the assigned Country.
3. USER OVERRIDE: If the user explicitly mentions a DIFFERENT shop, city, or state in their question (e.g., "Check the branch in Madurai instead"), you are authorized to ignore the default scope and query the specific location requested by the user.
4. Keep your responses concise, helpful, and professional.
"""

def get_recent_history(chat_history, count=3):
    """Get recent chat history messages"""
    return chat_history[-count:] if len(chat_history) > count else chat_history

def format_history_for_context(chat_history):
    """Format chat history for inclusion in prompts"""
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
    
    # Get session_id from header, query param, or body
    session_id = (request.headers.get('X-Session-ID') or 
                  request.args.get('session_id') or 
                  (data.get("session_id") if data else None))
    
    # Create new session_id if not provided
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Get or create session data
    session_data, returned_session_id = get_session_data(session_id)
    if session_data is None:
        session_data, returned_session_id = get_session_data()
    
    # Store individual session variables
    form_data = data.get("formData", {})
    session_data["shopName"] = form_data.get("shopName")
    session_data["city"] = form_data.get("city")
    session_data["state"] = form_data.get("state")
    session_data["country"] = form_data.get("country")
    session_data["productType"] = form_data.get("productType")
    session_data["shop_id"] = form_data.get("shopId")
    
    # Initialize empty chat history for this user session
    session_data["chat_history"] = []
    
    # Create a new chat instance for this user
    session_data["chat"] = session_data["client"].chats.create(model="gemini-2.5-flash-lite")
    
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

def generate_audio(message):
    """Generate audio from text message"""
    try:
        audio = client.text_to_speech.convert(
            text=message,
            voice_id="JBFqnCBsd6RMkjVDRZzb",
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        
        for chunk in audio:
            if chunk:
                yield chunk
    except Exception as e:
        print(f"Error generating audio: {e}")
        yield b''

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
    """Handle small talk queries with conversation context"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return "Please start a chat session first by calling /start-chat"
    
    chat_history = session_data.get("chat_history", [])
    chat = session_data.get("chat")
    
    if not chat:
        chat = session_data["client"].chats.create(model="gemini-2.5-flash-lite")
        session_data["chat"] = chat
    
    # Get general instruction for context
    general_instruction = get_general_instruction(session_data)
    
    # Format recent history for context
    context = format_history_for_context(chat_history)
    
    # Build prompt with system instruction and context
    if context:
        prompt = f"{general_instruction}\n\n{context}\nUser: {question}\nAssistant:"
    else:
        prompt = f"{general_instruction}\n\nUser: {question}\nAssistant:"
    
    try:
        response = chat.send_message(prompt)
        message = response.text
        
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
    """Handle out-of-domain queries politely"""
    session_data, session_id = get_session_data()
    if session_data is None:
        return "Please start a chat session first by calling /start-chat"
    
    chat_history = session_data.get("chat_history", [])
    chat = session_data.get("chat")
    
    if not chat:
        chat = session_data["client"].chats.create(model="gemini-2.5-flash-lite")
        session_data["chat"] = chat
    
    # Get general instruction for context
    general_instruction = get_general_instruction(session_data)
    
    # Format recent history for context
    context = format_history_for_context(chat_history)
    
    # Polite redirect with shop context
    shopName = session_data.get("shopName", "our store")
    city = session_data.get("city", "")
    
    if context:
        redirect_prompt = f"{general_instruction}\n\n{context}\nUser: {question}\n\nAs a professional retail assistant for {shopName} in {city}, politely explain that you can only help with shop-related topics like:\n- Product availability and prices\n- Stock information and warranties\n- Product features and comparisons\n- Store policies and services\n\nThen invite them to ask about our products or services.\nAssistant:"
    else:
        redirect_prompt = f"{general_instruction}\n\nUser: {question}\n\nAs a professional retail assistant for {shopName} in {city}, politely explain that you can only help with shop-related topics like:\n- Product availability and prices\n- Stock information and warranties\n- Product features and comparisons\n- Store policies and services\n\nThen invite them to ask about our products or services.\nAssistant:"
    
    try:
        response = chat.send_message(redirect_prompt)
        message = response.text
        
        # Update chat history
        session_data["chat_history"].append({
            "role": "user",
            "content": question,
            "response": message
        })
        
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
    
    # Get session context
    shopName = session_data.get("shopName", "Unknown")
    city = session_data.get("city", "Unknown")
    state = session_data.get("state", "Unknown")
    country = session_data.get("country", "Unknown")
    productType = session_data.get("productType", "all products")
    shop_id = session_data.get("shop_id")
    
    # Get recent questions for context
    recent_history = get_recent_history(chat_history, 3)
    recent_questions = [item.get("content", "") for item in recent_history if item.get("role") == "user"]
    
    # Build enhanced question with context
    context_info = f"""Context for this query:
- Shop: {shopName}
- Shop ID: {shop_id if shop_id else 'Any'}
- Location: {city}, {state}, {country}
- Product Type: {productType}
- Recent questions: {', '.join(recent_questions) if recent_questions else 'None'}
- Current question: {question}"""

    try:
        # Use the SQL chain from chatwithsql.py
        response = sql_chain.invoke({"question": context_info})
        message = response
        
        # Update chat history
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
    
    # Print detailed chat sessions info
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
        print(f"  Chat Object: {'Active' if data.get('chat') else 'None'}")
        print(f"  Client Object: {'Active' if data.get('client') else 'None'}")
        
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
    
    try:
        audio_response = Response(generate_audio(response_text), mimetype="audio/mpeg")
        audio_response.headers["Content-Disposition"] = "inline; filename=audio.mp3"
        audio_response.headers["Accept-Ranges"] = "bytes"
        
        # Return both text and audio
        return jsonify({
            "text": response_text,
            "intent": intent,
            "audio_url": "/audio response"
        })
    except Exception as e:
        print(f"Error generating audio: {e}")
        return jsonify({
            "text": response_text,
            "intent": intent,
            "error": "Audio generation failed"
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
    session_data["chat"] = None
    
    # Reinitialize chat object
    session_data["chat"] = session_data["client"].chats.create(model="gemini-2.5-flash-lite")
    
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

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000, debug=False)

