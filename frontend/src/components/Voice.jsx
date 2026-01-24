import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition
} from "react-speech-recognition";
import "../styles/Voice.css";


const Voice = ({ onClose }) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Tap to speak");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const lastTranscriptRef = useRef("");
  const pauseTimeoutRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const lastSentTranscriptRef = useRef("");
  const currentTimeoutRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (transcript !== lastTranscriptRef.current) {
      const newText = transcript.slice(lastTranscriptRef.current.length);
      if (newText.trim()) {
        setInterimTranscript(newText);
      }
      lastTranscriptRef.current = transcript;
    }
  }, [transcript]);

  useEffect(() => {
    if (isPlayingAudio) {
      setStatus("Playing response...");
    } else if (listening && !isMuted) {
      setStatus("Listening...");
    } else if (isMuted) {
      setStatus("Muted - tap to unmute");
    } else {
      setStatus("Tap to speak");
    }
  }, [listening, isMuted, isPlayingAudio]);

  useEffect(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }

    if (listening && !isMuted && transcript.trim()) {
      pauseTimeoutRef.current = setTimeout(() => {
        if (transcript.trim()) {
          sendTranscript();
        }
      }, 1500);
    }

    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, [transcript, listening, isMuted]);

  const sendTranscript = useCallback(() => {
    const finalTranscript = transcript.trim();

    // Validation checks
    if (!finalTranscript) {
      console.log("Skipping: empty transcript");
      return;
    }

    // Prevent duplicate requests
    if (isTranscribingRef.current) {
      console.log("Skipping: transcription already in progress");
      return;
    }

    // Prevent sending the same transcript multiple times
    if (lastSentTranscriptRef.current === finalTranscript) {
      console.log("Skipping: duplicate transcript");
      return;
    }

    // Clear any pending timeout
    if (currentTimeoutRef.current) {
      clearTimeout(currentTimeoutRef.current);
      currentTimeoutRef.current = null;
    }

    console.log("Sending transcript:", finalTranscript);
    
    // Mark as transcribing
    isTranscribingRef.current = true;
    lastSentTranscriptRef.current = finalTranscript;
    
    setIsMuted(true);
    setIsPlayingAudio(true);

    fetch("http://localhost:3000/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: finalTranscript }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.blob();
      })
      .then((audioBlob) => {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // Store audio reference for stopping later
        audioRef.current = audio;

        audio.play().catch((err) => {
          console.error("Error playing audio:", err);
          setIsPlayingAudio(false);
          setIsMuted(false);
          isTranscribingRef.current = false;
          audioRef.current = null;
        });

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl); // cleanup
          setIsPlayingAudio(false);
          setIsMuted(false);
          resetTranscript();
          isTranscribingRef.current = false;
          lastSentTranscriptRef.current = "";
          lastTranscriptRef.current = "";
          audioRef.current = null;
        };
      })
      .catch((err) => {
        console.error("Error sending transcript:", err);
        setIsPlayingAudio(false);
        setIsMuted(false);
        isTranscribingRef.current = false;
      });
  }, [transcript, resetTranscript]);


  const startListening = () => {
    setIsMuted(false);
    SpeechRecognition.startListening({
      continuous: true,
      language: "en-IN"
    });
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
      // Unmute - resume
      SpeechRecognition.startListening({
        continuous: true,
        language: "en-IN"
      });
      setIsMuted(false);
    } else {
      // Mute - pause
      SpeechRecognition.stopListening();
      setIsMuted(true);
    }
  };

  // Stop audio playback when closing the modal
  const handleClose = () => {
    // Stop audio if playing
    if (audioRef.current) {
      console.log("Stopping audio playback");
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Reset all state
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current = false;
    lastSentTranscriptRef.current = "";
    lastTranscriptRef.current = "";
    
    // Clear any pending timeouts
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    if (currentTimeoutRef.current) {
      clearTimeout(currentTimeoutRef.current);
      currentTimeoutRef.current = null;
    }
    
    // Stop speech recognition if active
    if (listening) {
      SpeechRecognition.stopListening();
    }
    
    // Call the original onClose callback
    onClose();
  };

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="voice-modal-overlay">
        <div className="voice-modal">
          <button className="voice-modal-close" onClick={handleClose}>
            ×
          </button>
          <div className="voice-content">
            <p className="voice-status">Browser doesn't support speech recognition.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-modal-overlay">
      <div className="voice-modal">
        <button className="voice-modal-close" onClick={handleClose}>
          ×
        </button>

        <div className="voice-content">
          <button
            className="voice-mic-button"
            onClick={toggleRecording}
          >
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
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          <p className="voice-status">{status}</p>

          {(transcript || interimTranscript) && (
            <div className="voice-transcript-container">
              <p className="voice-transcript">
                {transcript}
                <span className="voice-interim">{interimTranscript}</span>
              </p>
            </div>
          )}

          {listening && (
            <div className="voice-controls">
              <button
                className={`voice-mute-btn ${isMuted ? "muted" : ""}`}
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Voice;

