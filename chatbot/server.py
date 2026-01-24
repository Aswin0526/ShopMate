from flask import Flask, session, request, jsonify,Response
from datetime import timedelta
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

load_dotenv()

load_dotenv()

client = ElevenLabs(
    api_key=os.getenv("ELEVENLABS_API_KEY")
)

GEMENI_API_KEY = os.getenv("GEMENI_API_KEY")
assistant = genai.Client(api_key=GEMENI_API_KEY)
chat = assistant.chats.create(model="gemini-3-flash-preview")

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:5173"]  
)

app.secret_key = "shopmate123"
app.permanent_session_lifetime = timedelta(hours=1)

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

class TranscriptRequest(BaseModel):
    text: str

@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    text = data.get("text", "")

    print("Received transcript:", text)

    # response = chat.send_message(text)
    # message = response.text
    # print("AI message:", message)
    message = "Hello I'm fine what about you"

    def generate_audio():
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

    response = Response(generate_audio(), mimetype="audio/mpeg")
    response.headers["Content-Disposition"] = "inline; filename=audio.mp3"
    response.headers["Accept-Ranges"] = "bytes"
    return response

app.run(port=3000, debug=False)

