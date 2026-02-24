import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition
} from "react-speech-recognition";
import "../styles/Voice.css";
import { EdgeTTS } from 'edge-tts-universal/browser';

const Voice = ({ onClose }) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const [isMuted, setIsMuted]                   = useState(false);
  const [status, setStatus]                     = useState("Tap to speak");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isPlayingAudio, setIsPlayingAudio]     = useState(false);

  // ── Image state ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage]   = useState(null);
  const [imagePreview, setImagePreview]     = useState(null);
  const [awaitingImage, setAwaitingImage]   = useState(false);
  const [imageContext, setImageContext]     = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");

  const lastTranscriptRef      = useRef("");
  const pauseTimeoutRef        = useRef(null);
  const isTranscribingRef      = useRef(false);
  const lastSentTranscriptRef  = useRef("");
  const currentTimeoutRef      = useRef(null);
  const audioRef               = useRef(null);
  const fileInputRef           = useRef(null);

  // ── Image handlers ───────────────────────────────────────────────────────
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024)    { alert("Image size should be less than 5MB"); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target.result);
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const triggerFileInput = () => fileInputRef.current.click();

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Transcript tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (transcript !== lastTranscriptRef.current) {
      const newText = transcript.slice(lastTranscriptRef.current.length);
      if (newText.trim()) setInterimTranscript(newText);
      lastTranscriptRef.current = transcript;
    }
  }, [transcript]);

  // ── Status label ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlayingAudio)              setStatus("Playing response...");
    else if (awaitingImage)          setStatus("Please upload the photo below");
    else if (listening && !isMuted)  setStatus("Listening...");
    else if (isMuted)                setStatus("Muted — tap to unmute");
    else                             setStatus("Tap to speak");
  }, [listening, isMuted, isPlayingAudio, awaitingImage]);

  // ── Auto-send after 1.5s pause ───────────────────────────────────────────
  useEffect(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    if (listening && !isMuted && transcript.trim()) {
      pauseTimeoutRef.current = setTimeout(() => {
        if (transcript.trim()) sendTranscript();
      }, 1500);
    }
    return () => { if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current); };
  }, [transcript, listening, isMuted]);

  // ── Session ID ───────────────────────────────────────────────────────────
  const getSessionId = useCallback(() => {
    let id = localStorage.getItem("session_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("session_id", id); }
    return id;
  }, []);

  // ── TTS playback ─────────────────────────────────────────────────────────
  const playTTS = useCallback(async (text) => {
    try {
      setIsPlayingAudio(true);
      const ttsInstance = new EdgeTTS(text, "en-IN-NeerjaNeural");
      const result      = await ttsInstance.synthesize();
      const blob        = new Blob([result.audio], { type: "audio/mpeg" });
      const audioUrl    = URL.createObjectURL(blob);
      const audio       = new Audio(audioUrl);
      audioRef.current  = audio;

      audio.play().catch((err) => { console.error("Playback error:", err); setIsPlayingAudio(false); });

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlayingAudio(false);
        setIsMuted(false);
        resetTranscript();
        isTranscribingRef.current = false;
        audioRef.current          = null;
      };
    } catch (err) {
      console.error("TTS error:", err);
      setIsPlayingAudio(false);
    }
  }, [resetTranscript]);

  // ── Main send ────────────────────────────────────────────────────────────
  const sendTranscript = useCallback((overrideText = null) => {
    const finalTranscript = (overrideText || transcript).trim();

    if (!finalTranscript)                                             { console.log("Skipping: empty");     return; }
    if (isTranscribingRef.current)                                    { console.log("Skipping: in progress"); return; }
    if (!overrideText && lastSentTranscriptRef.current === finalTranscript) { console.log("Skipping: duplicate"); return; }

    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }

    isTranscribingRef.current     = true;
    lastSentTranscriptRef.current = finalTranscript;
    setIsMuted(true);
    setIsPlayingAudio(true);

    const session_id  = getSessionId();
    const imageToSend = uploadedImage || null;
    const payload     = { text: finalTranscript };
    if (imageToSend) payload.image = imageToSend;

    console.log("Sending:", finalTranscript, imageToSend ? "[+IMAGE]" : "");

    fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
      body:    JSON.stringify(payload)
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(async (data) => {
        const { text: responseText, needs_image: needsImage, image_context: imgContext } = data;

        if (imageToSend) removeImage();

        if (needsImage && imgContext) {
          setAwaitingImage(true);
          setImageContext(imgContext);
          setImagePromptMsg(responseText);
        } else {
          setAwaitingImage(false);
          setImageContext("");
          setImagePromptMsg("");
        }

        if (responseText) await playTTS(responseText);
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        setIsPlayingAudio(false);
        setIsMuted(false);
        isTranscribingRef.current = false;
      });
  }, [transcript, uploadedImage, getSessionId, playTTS]);

  // ── Send image when bot is waiting ───────────────────────────────────────
  const sendImageNow = useCallback(() => {
    if (!uploadedImage) return;
    sendTranscript(`Here is the photo you asked for: ${imageContext}`);
  }, [uploadedImage, imageContext, sendTranscript]);

  // ── Recording controls ───────────────────────────────────────────────────
  const startListening = () => {
    setIsMuted(false);
    SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    sendTranscript();
  };

  const toggleRecording = () => {
    if (listening && !isMuted) {
      stopListening();
    } else if (isMuted) {
      startListening();
    } else {
      resetTranscript();
      lastTranscriptRef.current = "";
      setInterimTranscript("");
      startListening();
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
      setIsMuted(false);
    } else {
      SpeechRecognition.stopListening();
      setIsMuted(true);
    }
  };

  const stopAndListen = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current     = false;
    lastSentTranscriptRef.current = "";
    if (pauseTimeoutRef.current)   { clearTimeout(pauseTimeoutRef.current);   pauseTimeoutRef.current   = null; }
    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }
    resetTranscript();
    lastTranscriptRef.current = "";
    setInterimTranscript("");
    SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
  };

  const handleClose = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current     = false;
    lastSentTranscriptRef.current = "";
    lastTranscriptRef.current     = "";
    if (pauseTimeoutRef.current)   { clearTimeout(pauseTimeoutRef.current);   pauseTimeoutRef.current   = null; }
    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }
    if (listening) SpeechRecognition.stopListening();
    onClose();
  };

  // ── Browser support ──────────────────────────────────────────────────────
  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="voice-modal-overlay">
        <div className="voice-modal">
          <div className="voice-header">
            <p className="voice-header-title">ShopMate Voice</p>
            <button className="voice-modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="voice-content">
            <p className="voice-status">Browser doesn't support speech recognition.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="voice-modal-overlay">
      <div className="voice-modal">

        {/* ── Fixed header ── */}
        <div className="voice-header">
          <p className="voice-header-title">ShopMate Voice</p>
          <button className="voice-modal-close" onClick={handleClose}>×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="voice-content">

          {/* Mic + status always at top */}
          <div className="voice-top-section">
            <button className="voice-mic-button" onClick={toggleRecording}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`voice-mic-icon ${listening && !isMuted ? "recording" : ""}`}
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8"  y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <p className="voice-status">{status}</p>
          </div>

          {/* Stop & Listen */}
          {isPlayingAudio && (
            <button className="voice-stop-button" onClick={stopAndListen}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="voice-stop-icon">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="voice-stop-text">Stop & Listen</span>
            </button>
          )}

          {/* Bot image request banner */}
          {awaitingImage && (
            <div className="voice-image-request">
              <p className="voice-image-request-msg">📸 {imagePromptMsg}</p>
              <p className="voice-image-hint">Upload your photo below, then tap "Send Photo"</p>
            </div>
          )}

          {/* Image upload / preview section */}
          <div className={`voice-image-section ${awaitingImage ? "voice-image-section--active" : ""}`}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              style={{ display: "none" }}
            />

            {imagePreview ? (
              <div className="voice-image-preview-container">
                <img src={imagePreview} alt="Uploaded" className="voice-image-preview" />
                <div className="voice-image-actions">
                  <button className="voice-image-remove-btn" onClick={removeImage}>✕ Remove</button>
                  {awaitingImage && (
                    <button className="voice-image-send-btn" onClick={sendImageNow}>
                      📤 Send Photo
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                className={`voice-image-upload-btn ${awaitingImage ? "voice-image-upload-btn--pulse" : ""}`}
                onClick={triggerFileInput}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {awaitingImage ? "Upload Photo" : "Add Image"}
              </button>
            )}
          </div>

          {/* Transcript */}
          {(transcript || interimTranscript) && (
            <div className="voice-transcript-container">
              <p className="voice-transcript">
                {transcript}
                <span className="voice-interim">{interimTranscript}</span>
              </p>
            </div>
          )}

          {/* Mute control */}
          {listening && (
            <div className="voice-controls">
              <button
                className={`voice-mute-btn ${isMuted ? "muted" : ""}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8"  y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8"  y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          )}

        </div>{/* end voice-content */}
      </div>
    </div>
  );
};

export default Voice;