import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { EdgeTTS } from 'edge-tts-universal/browser';
import "../styles/Home.css";

const Home = ({ onClose }) => {
  // ── Chat State ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);

  // ── Speech Recognition ──────────────────────────────────────────────────
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const [isMuted, setIsMuted] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  // ── Image State ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [awaitingImage, setAwaitingImage] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");

  // ── Wishlist State ───────────────────────────────────────────────────────
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [showWishlistDialog, setShowWishlistDialog] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const lastTranscriptRef = useRef("");
  const pauseTimeoutRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const lastSentTranscriptRef = useRef("");
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // ── Auto-scroll ─────────────────────────────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // ── Image Handlers ───────────────────────────────────────────────────────
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image size should be less than 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target.result);
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Transcript Tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (transcript !== lastTranscriptRef.current) {
      const newText = transcript.slice(lastTranscriptRef.current.length);
      if (newText.trim()) setInterimTranscript(newText);
      lastTranscriptRef.current = transcript;
    }
  }, [transcript]);

  // ── Session ID ───────────────────────────────────────────────────────────
  const getSessionId = useCallback(() => {
    let id = localStorage.getItem("session_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("session_id", id); }
    return id;
  }, []);

  // ── TTS Playback ─────────────────────────────────────────────────────────
  const playTTS = useCallback(async (text) => {
    try {
      setIsPlayingAudio(true);
      const ttsInstance = new EdgeTTS(text, "en-IN-NeerjaNeural");
      const result = await ttsInstance.synthesize();
      const blob = new Blob([result.audio], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play().catch((err) => {
        console.error("Playback error:", err);
        setIsPlayingAudio(false);
        setIsMuted(false);
      });
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlayingAudio(false);
        setIsMuted(false);
        resetTranscript();
        SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
        isTranscribingRef.current = false;
        audioRef.current = null;
      };
    } catch (err) {
      console.error("TTS error:", err);
      setIsPlayingAudio(false);
    }
  }, [resetTranscript]);

  // ── Main Chat Logic ──────────────────────────────────────────────────────
  const sendChat = useCallback(async (textOverride = null) => {
    const finalMsg = (textOverride || inputText || transcript).trim();
    if (!finalMsg) return;

    if (isTranscribingRef.current) return;
    if (!textOverride && lastSentTranscriptRef.current === finalMsg && listening) return;

    // Add user message to UI
    const userMsg = {
      id: Date.now(),
      text: finalMsg,
      sender: "user",
      image: uploadedImage
    };
    setMessages(prev => [...prev, userMsg]);

    // Clear inputs
    setInputText("");
    resetTranscript();
    setInterimTranscript("");
    lastTranscriptRef.current = "";
    lastSentTranscriptRef.current = finalMsg;

    setIsTyping(true);
    isTranscribingRef.current = true;

    const session_id = getSessionId();
    const payload = { text: finalMsg };
    if (uploadedImage) payload.image = uploadedImage;

    try {
      if (listening) {
        SpeechRecognition.stopListening();
        setIsMuted(true);
      }

      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      const {
        text: responseText,
        needs_image: needsImage,
        image_context: imgContext,
        needs_wishlist: needsWishlist,
        wishlist_products: wProducts = [],
      } = data;

      if (uploadedImage) removeImage();

      // Handling logic
      if (needsWishlist && wProducts.length > 0) {
        setWishlistProducts(wProducts);
        setShowWishlistDialog(true);
        setIsPlayingAudio(false);
      }

      if (needsImage && imgContext) {
        setAwaitingImage(true);
        setImageContext(imgContext);
        setImagePromptMsg(responseText);
      } else {
        setAwaitingImage(false);
        setImageContext("");
      }

      // Add bot message
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: responseText,
        sender: "bot"
      }]);

      setIsTyping(false);
      isTranscribingRef.current = false;

      if (responseText) await playTTS(responseText);

    } catch (err) {
      console.error("Chat error:", err);
      setIsTyping(false);
      isTranscribingRef.current = false;
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: err.message || "Sorry, I'm having trouble connecting right now. Please try again.",
        sender: "bot",
        error: true
      }]);
    }
  }, [inputText, transcript, uploadedImage, getSessionId, playTTS, resetTranscript, listening]);

  // ── Auto-Initialization ────────────────────────────────────────────────
  useEffect(() => {
    const initChat = async () => {
      const session_id = localStorage.getItem("session_id") || getSessionId();
      const shopDetails = JSON.parse(localStorage.getItem("sc_details"));

      console.log("Chat Initialization Status:", {
        session_id,
        shopDetails,
        chatbot_url: import.meta.env.VITE_CHATBOT_URL,
        speech_support: browserSupportsSpeechRecognition
      });

      if (!shopDetails) {
        console.warn("Initializing chat: Missing shop details in localStorage.");
        return;
      }

      try {
        // Check if session is alive
        const checkRes = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/chat-history`, {
          headers: { "X-Session-ID": session_id }
        });

        if (!checkRes.ok) {
          // Session expired or missing on server, RE-INITIALIZE
          setIsTyping(true);
          const startRes = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/start-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
            body: JSON.stringify({
              session_id: session_id,
              formData: {
                shopName: shopDetails.shopName,
                shopId: shopDetails.shopId,
                city: shopDetails.city || "",
                state: shopDetails.state || "",
                country: shopDetails.country || "",
                productType: shopDetails.shopType
              }
            })
          });

          if (startRes.ok) {
            const startData = await startRes.json();
            if (startData.welcome) {
              setMessages([{
                id: Date.now(),
                text: startData.welcome,
                sender: "bot"
              }]);
              await playTTS(startData.welcome);
            }
          }
          setIsTyping(false);
        } else {
          // Session is alive, fetch history
          const historyData = await checkRes.json();
          if (historyData.chat_history && historyData.chat_history.length > 0) {
            const formattedHistory = [];
            historyData.chat_history.forEach((m, i) => {
              formattedHistory.push({
                id: `u-${i}`,
                text: m.content,
                sender: "user"
              });
              formattedHistory.push({
                id: `b-${i}`,
                text: m.response,
                sender: "bot"
              });
            });
            setMessages(formattedHistory);
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
      }
    };

    initChat();
  }, [getSessionId, playTTS]);

  // ── Auto-send after 1.5s pause (only when listening) ─────────────────────
  useEffect(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    if (listening && !isMuted && transcript.trim()) {
      pauseTimeoutRef.current = setTimeout(() => {
        if (transcript.trim()) sendChat(transcript);
      }, 1500);
    }
    return () => { if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current); };
  }, [transcript, listening, isMuted, sendChat]);

  // ── Wishlist Confirmation ────────────────────────────────────────────────
  const handleWishlistConfirm = useCallback((product) => {
    const shopDetails = JSON.parse(localStorage.getItem("sc_details"));
    if (shopDetails) {
      const token = localStorage.getItem("access_token");
      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/addWishList`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cust_id: shopDetails.custId,
          productId: product.product_id,
          shopId: shopDetails.shopId,
          type: shopDetails.shopType,
          product_name: product.product_name
        }),
      });
    }

    setShowWishlistDialog(false);
    setWishlistProducts([]);
    sendChat(`I've selected ${product.product_name} for my wishlist.`);
  }, [sendChat]);

  // ── Recording Controls ───────────────────────────────────────────────────
  const toggleRecording = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      resetTranscript();
      lastTranscriptRef.current = "";
      setInterimTranscript("");
      SpeechRecognition.startListening({ continuous: true, language: "en-IN" });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  // ── Suggestions ──────────────────────────────────────────────────────────
  const suggestions = [
    { title: "Find Products", text: "What are the trending items today?" },
    { title: "Price Check", text: "Is there a discount on milk?" },
    { title: "Gift Ideas", text: "Help me find a gift for a 5-year-old." },
    { title: "Store Hours", text: "When does the shop close?" }
  ];

  // ── Analysis on close ────────────────────────────────────────────────────
  const handleExit = useCallback(async () => {
    const session_id = getSessionId();
    try {
      setIsAnalysing(true);
      await fetch(`${import.meta.env.VITE_CHATBOT_URL}/analyze-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
      });
      // We don't remove sc_details here because user might return
      localStorage.removeItem("session_id");
    } catch (err) {
      console.warn("Analysis error:", err);
    } finally {
      setIsAnalysing(false);
      if (onClose) onClose();
    }
  }, [getSessionId, onClose]);

  useEffect(() => {
    console.log("Home component mounted (overlay). Speech support:", browserSupportsSpeechRecognition);
  }, [browserSupportsSpeechRecognition]);

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="home-chat-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', background: '#f9f9f9', padding: '20px', textAlign: 'center' }}>
        Voice recognition not supported in this browser. Please use Chrome.
      </div>
    );
  }

  return (
    <div className="home-chat-container">
      {/* Header */}
      <header className="home-chat-header">
        <div className="home-chat-header-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
          </svg>
          ShopMate Assistant
        </div>
        <button className="home-icon-button" onClick={handleExit} title="Exit Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </header>

      {/* Main Chat Area */}
      <main className="home-chat-area">
        {messages.length === 0 ? (
          <div className="home-empty-content">
            <div className="home-bot-logo">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="var(--accent-color)">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="home-welcome-text">How can I help you today?</h1>
            <div className="home-suggestion-grid">
              {suggestions.map((s, i) => (
                <button key={i} className="home-suggestion-card" onClick={() => sendChat(s.text)}>
                  <p className="home-suggestion-title">{s.title}</p>
                  <p className="home-suggestion-text">"{s.text}"</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className="home-message-row">
                <div className="home-message-content">
                  <div className={`home-avatar home-avatar-${msg.sender}`}>
                    {msg.sender === "bot" ? "AI" : "U"}
                  </div>
                  <div className="home-message-body">
                    <div className="home-message-text">{msg.text}</div>
                    {msg.image && <img src={msg.image} className="home-message-image" alt="User upload" />}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="home-message-row">
                <div className="home-message-content">
                  <div className="home-avatar home-avatar-bot">AI</div>
                  <div className="home-message-body">
                    <div className="typing-indicator">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Fixed Bottom Input Box */}
      <div className="home-input-section">
        <div className="home-input-wrapper">
          {imagePreview && (
            <div className="home-image-preview-bar">
              <div style={{ position: 'relative' }}>
                <img src={imagePreview} className="home-preview-thumbnail" alt="Preview" />
                <button className="home-remove-image-btn" onClick={removeImage}>✕</button>
              </div>
              {awaitingImage && <span style={{ fontSize: '0.8rem', alignSelf: 'center', opacity: 0.7 }}>← Bot is waiting for this photo</span>}
            </div>
          )}

          <div className="home-input-row">
            <textarea
              className="home-input-field"
              placeholder="Message ShopMate..."
              value={listening && !isPlayingAudio ? (transcript + interimTranscript) : inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              rows="1"
            />

            <div className="home-action-buttons">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: "none" }}
              />
              <button
                className={`home-icon-button ${awaitingImage ? "active" : ""}`}
                onClick={() => fileInputRef.current.click()}
                title="Upload Image"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              <button
                className={`home-icon-button home-mic-button ${listening ? "recording" : ""}`}
                onClick={toggleRecording}
                title="Voice Input"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              <button
                className="home-icon-button home-send-button"
                onClick={() => sendChat()}
                disabled={!inputText && !transcript && !uploadedImage}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Wishlist Dialog */}
      {showWishlistDialog && (
        <div className="home-wl-overlay">
          <div className="home-wl-modal">
            <div className="home-wl-header">
              <h2 className="home-wl-title">Add to Wishlist</h2>
              <button className="home-icon-button" onClick={() => setShowWishlistDialog(false)}>✕</button>
            </div>
            <div className="home-wl-list">
              {wishlistProducts.map((p, i) => (
                <div key={i} className="home-wl-item" onClick={() => handleWishlistConfirm(p)}>
                  <div className="home-wl-item-info">
                    <span className="home-wl-item-name">{p.product_name}</span>
                    <span className="home-wl-item-price">₹{p.price}</span>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analysing Overlay */}
      {isAnalysing && (
        <div className="voice-analysing-overlay">
          <div className="voice-analysing-card">
            <div className="voice-analysing-spinner" />
            <p className="voice-analysing-title">Analysing conversation...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
