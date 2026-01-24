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

load_dotenv()

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
    origins=["http://localhost:5173"]  
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
    
    # Rate limiting check
    if is_rate_limited(text):
        print(f"Request rate limited for transcript: '{text[:50]}...'")
        return jsonify({
            "error": "Rate limited",
            "message": "Please wait before sending another request"
        }), 429

    print("Processing transcript:", text)

    try:
        response = chat.send_message(text)
        message = response.text
        print("AI message:", message)

        response = Response(generate_audio(message), mimetype="audio/mpeg")
        response.headers["Content-Disposition"] = "inline; filename=audio.mp3"
        response.headers["Accept-Ranges"] = "bytes"
        return response
    except Exception as e:
        print(f"Error processing transcript: {e}")
        # Reset rate limiting on error to allow retry
        global last_request_time
        last_request_time = datetime.min
        return jsonify({"error": str(e)}), 500

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
    app.run(host='0.0.0.0', port=3000)

