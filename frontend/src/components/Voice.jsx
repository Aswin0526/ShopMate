import { useState, useEffect, useCallback, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition
} from "react-speech-recognition";
import "../styles/Voice.css";
import { EdgeTTS } from 'edge-tts-universal/browser';

const Voice = ({ onClose, isPage = false }) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const [isMuted, setIsMuted]                     = useState(false);
  const [status, setStatus]                       = useState("Tap to speak");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isPlayingAudio, setIsPlayingAudio]       = useState(false);
  const [isAnalysing, setIsAnalysing]             = useState(false);

  // ── Image state ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage]   = useState(null);
  const [imagePreview, setImagePreview]     = useState(null);
  const [awaitingImage, setAwaitingImage]   = useState(false);
  const [imageContext, setImageContext]     = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");

  // ── Wishlist state ───────────────────────────────────────────────────────
  const [wishlistProducts, setWishlistProducts]     = useState([]);
  const [showWishlistDialog, setShowWishlistDialog] = useState(false);

  // ── Product Dialog state ─────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [showProductDialog, setShowProductDialog] = useState(false);

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
    reader.onload = (e) => { setUploadedImage(e.target.result); setImagePreview(e.target.result); };
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
    if (isPlayingAudio)             setStatus("Playing response...");
    else if (showWishlistDialog)    setStatus("Pick a product to wishlist");
    else if (awaitingImage)         setStatus("Please upload the photo below");
    else if (listening && !isMuted) setStatus("Listening...");
    else if (isMuted)               setStatus("Muted — tap to unmute");
    else                            setStatus("Tap to speak");
  }, [listening, isMuted, isPlayingAudio, awaitingImage, showWishlistDialog]);

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

    if (!finalTranscript)                                                    { console.log("Skipping: empty");      return; }
    if (isTranscribingRef.current)                                           { console.log("Skipping: in progress"); return; }
    if (!overrideText && lastSentTranscriptRef.current === finalTranscript)  { console.log("Skipping: duplicate");  return; }

    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }

    isTranscribingRef.current     = true;
    lastSentTranscriptRef.current = finalTranscript;
    setIsMuted(true);
    setIsPlayingAudio(true);

    const session_id  = getSessionId();
    const imageToSend = uploadedImage || null;
    const payload     = { text: finalTranscript };
    if (imageToSend) payload.image = imageToSend;

    fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
      body:    JSON.stringify(payload)
    })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(async (data) => {
        const {
          text: responseText,
          needs_image: needsImage,
          image_context: imgContext,
          needs_wishlist: needsWishlist,
          wishlist_products: wProducts = [],
          products: responseProducts = [],
        } = data;

        if (imageToSend) removeImage();

        // ── Wishlist dialog ──────────────────────────────────────────────
        if (needsWishlist && wProducts.length > 0) {
          setWishlistProducts(wProducts);
          setShowWishlistDialog(true);
          setIsPlayingAudio(false);
          isTranscribingRef.current = false;
          // Still speak the bot's reply before showing dialog
          if (responseText) await playTTS(responseText);
          return;
        }

        // ── Product dialog ───────────────────────────────────────────────
        if (responseProducts.length > 0) {
          setProducts(responseProducts);
          setShowProductDialog(true);
        }

        // ── Image request ────────────────────────────────────────────────
        if (needsImage && imgContext) {
          setAwaitingImage(true);
          setImageContext(imgContext);
          setImagePromptMsg(responseText);
        } else {
          setAwaitingImage(false);
          setImageContext("");
          setImagePromptMsg("");
        }

        if (responseText) {
          await playTTS(responseText);
        }
      })
      .catch((err) => {
        console.error("Fetch error:", err);
        setIsPlayingAudio(false);
        setIsMuted(false);
        isTranscribingRef.current = false;
      });
  }, [transcript, uploadedImage, getSessionId, playTTS]);

    const handleWishlistConfirm = useCallback((product) => {
    
    const shopDetails = JSON.parse(localStorage.getItem("sc_details"));
    if (shopDetails) {
      const shopId = shopDetails.shopId;
      const productId = product.product_id;
      const custId = shopDetails.custId;
      const shopType = shopDetails.shopType;
      const product_name = product.product_name;
      const token = localStorage.getItem("access_token");

      fetch(`${import.meta.env.VITE_BACKEND_URL}/api/customers/addWishList`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cust_id: custId,
          productId: productId,
          shopId: shopId,
          type: shopType,
          product_name: product_name
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log("Added in wishlist");
        } else {
          console.log("Not added in wishlist");
        }
      })
      .catch(error => {
        console.error("Error:", error);
      });
    }

    setShowWishlistDialog(false);
    setWishlistProducts([]);
    playTTS(`Sure! I'll add ${product.product_name} to your wishlist.`);
  }, [playTTS]);

  const handleWishlistDismiss = useCallback(() => {
    setShowWishlistDialog(false);
    setWishlistProducts([]);
  }, []);

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
    if (listening && !isMuted) stopListening();
    else if (isMuted) startListening();
    else {
      resetTranscript();
      lastTranscriptRef.current = "";
      setInterimTranscript("");
      startListening();
    }
  };

  const toggleMute = () => {
    if (isMuted) { SpeechRecognition.startListening({ continuous: true, language: "en-IN" }); setIsMuted(false); }
    else         { SpeechRecognition.stopListening(); setIsMuted(true); }
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

  const handleClose = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlayingAudio(false);
    setIsMuted(false);
    isTranscribingRef.current     = false;
    lastSentTranscriptRef.current = "";
    lastTranscriptRef.current     = "";
    if (pauseTimeoutRef.current)   { clearTimeout(pauseTimeoutRef.current);   pauseTimeoutRef.current   = null; }
    if (currentTimeoutRef.current) { clearTimeout(currentTimeoutRef.current); currentTimeoutRef.current = null; }
    if (listening) SpeechRecognition.stopListening();

    const session_id = getSessionId();
    try {
      setIsAnalysing(true);
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/analyze-session`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          localStorage.removeItem("session_id");
          localStorage.removeItem("shopmate_analyses");
          localStorage.removeItem("sc_details");
        }
      }
    } catch (err) {
      console.warn("Analysis error (non-blocking):", err);
    } finally {
      setIsAnalysing(false);
      onClose();
    }
  }, [listening, getSessionId, onClose]);

  // ── Browser support ──────────────────────────────────────────────────────
  if (!browserSupportsSpeechRecognition && !isPage) {
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
    <div className={isPage ? "voice-page-wrapper" : "voice-modal-overlay"}>
      <div className={isPage ? "voice-page-container" : "voice-modal"}>

        {/* ── Fixed header ── */}
        <div className="voice-header">
          <p className="voice-header-title">{isPage ? "ShopMate Text Chat" : "ShopMate Voice"}</p>
          <button className="voice-modal-close" onClick={handleClose}>×</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="voice-content">

          {/* Mic + status */}
          <div className="voice-top-section">
            <button className="voice-mic-button" onClick={toggleRecording}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   className={`voice-mic-icon ${listening && !isMuted ? "recording" : ""}`}>
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

          {/* Image upload / preview */}
          <div className={`voice-image-section ${awaitingImage ? "voice-image-section--active" : ""}`}>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload}
                   accept="image/*" style={{ display: "none" }} />
            {imagePreview ? (
              <div className="voice-image-preview-container">
                <img src={imagePreview} alt="Uploaded" className="voice-image-preview" />
                <div className="voice-image-actions">
                  <button className="voice-image-remove-btn" onClick={removeImage}>✕ Remove</button>
                  {awaitingImage && (
                    <button className="voice-image-send-btn" onClick={sendImageNow}>📤 Send Photo</button>
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
              <button className={`voice-mute-btn ${isMuted ? "muted" : ""}`} onClick={toggleMute}
                      title={isMuted ? "Unmute" : "Mute"}>
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

        </div>

        {/* ── Wishlist Product Dialog ── */}
        {showWishlistDialog && (
          <div className="wl-dialog-overlay">
            <div className="wl-dialog">
              <div className="wl-dialog-header">
                <span className="wl-dialog-icon">🛍️</span>
                <div>
                  <p className="wl-dialog-title">Add to Wishlist</p>
                  <p className="wl-dialog-sub">Tap the product you want to save</p>
                </div>
                <button className="wl-dialog-close" onClick={handleWishlistDismiss}>✕</button>
              </div>

              <div className="wl-product-list">
                {wishlistProducts.length === 0 ? (
                  <p className="wl-empty">No matching products found.</p>
                ) : (
                  wishlistProducts.map((product, i) => (
                    <button
                      key={product.product_id ?? i}
                      className="wl-product-card"
                      onClick={() => handleWishlistConfirm(product)}
                    >
                      <div className="wl-product-info">
                        <span className="wl-product-name">{product.product_name}</span>
                        {product.brand && (
                          <span className="wl-product-brand">{product.brand}</span>
                        )}
                        {product.description && (
                          <span className="wl-product-desc">{product.description}</span>
                        )}
                      </div>
                      {product.price != null && (
                        <span className="wl-product-price">₹{product.price}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button className="wl-cancel-btn" onClick={handleWishlistDismiss}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Analysing overlay ── */}
        {isAnalysing && (
          <div className="voice-analysing-overlay">
            <div className="voice-analysing-card">
              <div className="voice-analysing-spinner" />
              <p className="voice-analysing-title">Analysing conversation...</p>
              <p className="voice-analysing-sub">Generating insights from your session</p>
            </div>
          </div>
        )}

        {/* ── Product Display Dialog ── */}
        {showProductDialog && (
          <div className="product-dialog-overlay">
            <div className="product-dialog">
              <div className="product-dialog-header">
                <h2>Recommended Products</h2>
                <button className="product-dialog-close" onClick={() => setShowProductDialog(false)}>✕</button>
              </div>
              <div className="product-grid">
                {products.map((product, idx) => (
                  <ProductCard key={idx} product={product} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Inline Styles for Product Dialog */}
        <style>{`
          .product-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 40px;
            z-index: 5000;
            backdrop-filter: blur(4px);
          }
          .product-dialog {
            background: #ffffff;
            width: 90%;
            max-width: 1000px;
            max-height: 85vh;
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideDown {
            from { transform: translateY(-50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .product-dialog-header {
            padding: 20px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #eee;
          }
          .product-dialog-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #1a1a1a;
          }
          .product-dialog-close {
            background: #f0f0f0;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }
          .product-dialog-close:hover {
            background: #e0e0e0;
            transform: rotate(90deg);
          }
          .product-grid {
            padding: 24px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 24px;
            overflow-y: auto;
          }
          .product-card {
            background: #fff;
            border-radius: 16px;
            overflow: hidden;
            height: 420px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            transition: transform 0.3s, box-shadow 0.3s;
            border: 1px solid #f0f0f0;
          }
          .product-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 12px 24px rgba(0,0,0,0.15);
          }
          .product-card-top {
            height: 60%;
            position: relative;
            background: #f9f9f9;
          }
          .product-card-bottom {
            height: 40%;
            padding: 16px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .product-name {
            margin: 0 0 8px 0;
            font-size: 1.1rem;
            font-weight: 700;
            color: #1a1a1a;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .product-desc {
            font-size: 0.9rem;
            color: #666;
            margin: 0 0 12px 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.4;
          }
          .product-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .product-price {
            font-size: 1.2rem;
            font-weight: 800;
            color: #2c3e50;
          }
          .product-stock {
            font-size: 0.8rem;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
          }
          
          .carousel-view {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
          }
          .carousel-view img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: opacity 0.5s ease;
            position: absolute;
            top: 0;
            left: 0;
          }
          .carousel-dots {
            position: absolute;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 8px;
            z-index: 10;
          }
          .carousel-dot {
            width: 8px;
            height: 8px;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.3s;
          }
          .carousel-dot.active {
            background: #fff;
            transform: scale(1.2);
            box-shadow: 0 0 8px rgba(0,0,0,0.3);
          }
          .carousel-dot:hover {
            background: #fff;
            opacity: 1 !important;
            transform: scale(1.2);
          }
          .product-card:hover .carousel-dot {
            width: 10px;
            height: 10px;
            opacity: 0.9;
          }
        `}</style>
      </div>
    </div>
  );
};

const ProductCard = ({ product }) => {
  const [currentImg, setCurrentImg] = useState(0);
  const images = product.images || ["https://via.placeholder.com/600/400?text=Product"];

  return (
    <div className="product-card">
      <div className="product-card-top">
        <div className="carousel-view">
          {images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={product.name}
              style={{ 
                opacity: i === currentImg ? 1 : 0,
                zIndex: i === currentImg ? 1 : 0
              }}
            />
          ))}
          {images.length > 1 && (
            <div className="carousel-dots">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={`carousel-dot ${i === currentImg ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImg(i);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="product-card-bottom">
        <div>
          <h3 className="product-name">{product.name}</h3>
          <p className="product-desc">{product.description}</p>
        </div>
        <div className="product-meta">
          <span className="product-price">{product.price}</span>
          <span className="product-stock">In Stock: {product.stock}</span>
        </div>
      </div>
    </div>
  );
};



export default Voice;