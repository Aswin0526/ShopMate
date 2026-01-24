from flask import Flask, session, request, jsonify,Response
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
from sentence_transformers import SentenceTransformer, util
import torch

model = SentenceTransformer('all-mpnet-base-v2')

intents = {
    "SMALL_TALK": [
        "How are you?", "Who are you?", "Hello", "Good morning", "What's up",
        "Are you a robot?", "Nice to meet you", "Hey there", "Greetings",
        "Hope you are having a good day", "Bye", "Thank you"
    ],
    "DATA_QUERY": [
        "Quantity", "Stocks", "How many", "Do you have", "In stock", "price", "warranty", "image","model number",
        "How many books are in stock?", "Do you have 5 copies of Harry Potter?",
        "Is there any milk in the grocery section?", "Check electronics inventory",
        "How many red lipsticks are left?", "Are there any medium size t-shirts?",
        
        "Price", "Cost", "How much", "Rate", "Amount", "Discount",
        "What is the price of this product?", "How much does the laptop cost?",
        "What is the rate for organic milk?", "Is there a discount on cosmetics?",
        "Price list for groceries", "Tell me the cost of this shirt",
        "How much for 10 units of eggs?", "What is the total price?",

        "Where is this kept?", "Find the ID of this product", "Do you have warranty for this product", "model number of the product",
        "Which aisle is the grocery in?", "Product code for the electronics"
    ],
    "PRODUCT_INFO": [
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
assistant = genai.Client(api_key=GEMENI_API_KEY)
chat = assistant.chats.create(model="gemini-2.5-flash-lite")

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")]
)

app.secret_key = "shopmate123"
app.permanent_session_lifetime = timedelta(hours=1)

# Rate limiting configuration
RATE_LIMIT_SECONDS = 3 
last_request_time = datetime.min
last_request_text_hash = None

def is_rate_limited(text):
    """Check if the request should be rate limited"""
    global last_request_time, last_request_text_hash
    
    current_time = datetime.now()
    text_hash = hashlib.md5(text.encode()).hexdigest()
    
    # Check time-based rate limiting
    time_diff = (current_time - last_request_time).total_seconds()
    if time_diff < RATE_LIMIT_SECONDS:
        print(f"Rate limited: {time_diff:.2f}s since last request (minimum: {RATE_LIMIT_SECONDS}s)")
        return True
    
    # Check duplicate request deduplication
    if text_hash == last_request_text_hash:
        print("Rate limited: duplicate request detected")
        return True
    
    # Update tracking variables
    last_request_time = current_time
    last_request_text_hash = text_hash
    return False

@app.route("/start-chat", methods=["POST"])
def start_chat():
    session.permanent = True

    data = request.get_json()
    session["formData"] = data.get("formData")

    print("Stored in session:", session["formData"])

    return jsonify({"message": "Chat session started"})

@app.route("/get-session", methods=["GET"])
def get_session():
    return jsonify({
        "formData": session.get("formData")
    })

def generate_audio(message):
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

class TranscriptRequest(BaseModel):
    text: str

@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    text = data.get("text", "")

    # Validation
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
    print(get_intent(text))

    # try:
    #     response = chat.send_message(text)
    #     message = response.text
    #     print("AI message:", message)

    #     response = Response(generate_audio(message), mimetype="audio/mpeg")
    #     response.headers["Content-Disposition"] = "inline; filename=audio.mp3"
    #     response.headers["Accept-Ranges"] = "bytes"
    #     return response
    # except Exception as e:
    #     print(f"Error processing transcript: {e}")
    #     # Reset rate limiting on error to allow retry
    #     global last_request_time
    #     last_request_time = datetime.min
    #     return jsonify({"error": str(e)}), 500

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

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000, debug=True)

