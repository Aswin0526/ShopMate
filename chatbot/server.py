from flask import Flask, session, request, jsonify
from datetime import timedelta
from flask_cors import CORS
import google.generativeai as genai
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import GoogleGenerativeAI
import os
from pydantic import BaseModel

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

    return jsonify({
        "success": True,
        "received_text": text
    })

app.run(port=3000, debug=True)

