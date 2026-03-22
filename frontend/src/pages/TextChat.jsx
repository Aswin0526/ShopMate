import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import "../styles/TextChat.css";
import "../styles/TextChat.css";

function TextChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const messagesEndRef = useRef(null);

  // ── Image state ──────────────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [awaitingImage, setAwaitingImage] = useState(false);
  const [imageContext, setImageContext] = useState("");
  const [imagePromptMsg, setImagePromptMsg] = useState("");
  const fileInputRef = useRef(null);

  // ── Wishlist state ───────────────────────────────────────────────────────
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [showWishlistDialog, setShowWishlistDialog] = useState(false);

  // ── Product Dialog state ─────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [showProductDialog, setShowProductDialog] = useState(false);

  // ── Session ID ───────────────────────────────────────────────────────────
  const getSessionId = useCallback(() => {
    let id = localStorage.getItem("session_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("session_id", id); }
    return id;
  }, []);

  // ── Auto scroll to bottom ────────────────────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Image handlers ───────────────────────────────────────────────────────
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Image size should be less than 5MB"); return; }
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

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text, image = null) => {
    if (!text.trim() && !image) return;

    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      text: text,
      image: image
    }]);

    setIsLoading(true);
    const session_id = getSessionId();
    const payload = { text: text };
    if (image) payload.image = image;

    try {
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-ID": session_id },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const {
        text: responseText,
        needs_image: needsImage,
        image_context: imgContext,
        needs_wishlist: needsWishlist,
        wishlist_products: wProducts = [],
        products: responseProducts = [],
      } = data;

      if (image) removeImage();

      // ── Wishlist dialog ──────────────────────────────────────────────
      if (needsWishlist && wProducts.length > 0) {
        setWishlistProducts(wProducts);
        setShowWishlistDialog(true);
        setIsLoading(false);
        // Add bot message before showing dialog
        if (responseText) {
          setMessages(prev => [...prev, {
            id: Date.now() + 1,
            sender: 'bot',
            text: responseText
          }]);
        }
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

      // Add bot response
      if (responseText) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          text: responseText
        }]);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: "Sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [getSessionId]);

  // ── Handle send ──────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = inputText.trim();
    if (!text && !uploadedImage) return;

    const imageToSend = uploadedImage;
    setInputText("");
    sendMessage(text, imageToSend);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Send image when bot is waiting ───────────────────────────────────────
  const sendImageNow = useCallback(() => {
    if (!uploadedImage) return;
    sendMessage(`Here is the photo you asked for: ${imageContext}`, uploadedImage);
  }, [uploadedImage, imageContext, sendMessage]);

  // ── Wishlist handlers ────────────────────────────────────────────────────
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
          console.log("Added to wishlist");
        } else {
          console.log("Not added to wishlist");
        }
      })
      .catch(error => {
        console.error("Error:", error);
      });
    }

    setShowWishlistDialog(false);
    setWishlistProducts([]);
    setMessages(prev => [...prev, {
      id: Date.now() + 2,
      sender: 'bot',
      text: `Sure! I'll add ${product.product_name} to your wishlist.`
    }]);
  }, []);

  const handleWishlistDismiss = useCallback(() => {
    setShowWishlistDialog(false);
    setWishlistProducts([]);
  }, []);

  // ── Handle close ─────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    const session_id = getSessionId();
    try {
      setIsAnalysing(true);
      const res = await fetch(`${import.meta.env.VITE_CHATBOT_URL}/analyze-session`, {
        method: "POST",
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
      navigate(-1);
    }
  }, [getSessionId, navigate]);

  return (
    <div className="textchat-container">
      {/* Header */}
      <div className="textchat-header">
        <button className="textchat-back-btn" onClick={handleClose}>
          ← Back
        </button>
        <h1 className="textchat-title">ShopMate Chat</h1>
        <div className="textchat-spacer"></div>
      </div>

      {/* Messages */}
      <div className="textchat-messages">
        {messages.length === 0 ? (
          <div className="textchat-welcome">
            <div className="textchat-welcome-icon">🛍️</div>
            <h2>Welcome to ShopMate Chat!</h2>
            <p>Ask me anything about products, get recommendations, or browse the shop.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`textchat-message ${msg.sender === 'user' ? 'user' : 'bot'}`}>
              {msg.sender === 'bot' && (
                <div className="textchat-avatar bot-avatar">🤖</div>
              )}
              <div className="textchat-bubble">
                {msg.image && (
                  <img src={msg.image} alt="Uploaded" className="textchat-image" />
                )}
                <p>{msg.text}</p>
              </div>
              {msg.sender === 'user' && (
                <div className="textchat-avatar user-avatar">👤</div>
              )}
            </div>
          ))
        )}

        {/* Bot image request */}
        {awaitingImage && (
          <div className="textchat-message bot">
            <div className="textchat-avatar bot-avatar">🤖</div>
            <div className="textchat-bubble">
              <p>📸 {imagePromptMsg}</p>
              <p className="textchat-image-hint">Please upload your photo using the button below.</p>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="textchat-message bot">
            <div className="textchat-avatar bot-avatar">🤖</div>
            <div className="textchat-bubble typing">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image upload section */}
      {awaitingImage && (
        <div className="textchat-image-section">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            style={{ display: "none" }}
          />
          {imagePreview ? (
            <div className="textchat-image-preview">
              <img src={imagePreview} alt="Preview" />
              <div className="textchat-image-actions">
                <button onClick={removeImage}>Remove</button>
                <button onClick={sendImageNow} className="send-image-btn">Send Photo</button>
              </div>
            </div>
          ) : (
            <button className="textchat-upload-btn" onClick={triggerFileInput}>
              📤 Upload Photo
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="textchat-input-container">
        <div className="textchat-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            style={{ display: "none" }}
          />
          <button
            className="textchat-attach-btn"
            onClick={triggerFileInput}
            title="Attach image"
          >
            📎
          </button>
          <textarea
            className="textchat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows="1"
          />
          <button
            className="textchat-send-btn"
            onClick={handleSend}
            disabled={!inputText.trim() && !uploadedImage}
          >
            {isLoading ? "⏳" : "📤"}
          </button>
        </div>
      </div>

      {/* Wishlist Dialog */}
      {showWishlistDialog && (
        <div className="wishlist-overlay">
          <div className="wishlist-dialog">
            <div className="wishlist-header">
              <span className="wishlist-icon">🛍️</span>
              <div>
                <h3>Add to Wishlist</h3>
                <p>Tap the product you want to save</p>
              </div>
              <button className="wishlist-close" onClick={handleWishlistDismiss}>✕</button>
            </div>

            <div className="wishlist-products">
              {wishlistProducts.length === 0 ? (
                <p className="wishlist-empty">No matching products found.</p>
              ) : (
                wishlistProducts.map((product, i) => (
                  <button
                    key={product.product_id ?? i}
                    className="wishlist-product"
                    onClick={() => handleWishlistConfirm(product)}
                  >
                    <div className="wishlist-product-info">
                      <span className="wishlist-product-name">{product.product_name}</span>
                      {product.brand && (
                        <span className="wishlist-product-brand">{product.brand}</span>
                      )}
                      {product.description && (
                        <span className="wishlist-product-desc">{product.description}</span>
                      )}
                    </div>
                    {product.price != null && (
                      <span className="wishlist-product-price">₹{product.price}</span>
                    )}
                  </button>
                ))
              )}
            </div>

            <button className="wishlist-cancel" onClick={handleWishlistDismiss}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Analysing overlay */}
      {isAnalysing && (
        <div className="analysing-overlay">
          <div className="analysing-card">
            <div className="analysing-spinner"></div>
            <p>Analysing conversation...</p>
            <p>Generating insights from your session</p>
          </div>
        </div>
      )}
      {/* Product Display Dialog */}
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
          z-index: 2000;
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
  );
}

// ── Shared Components for UI ───────────────────────────────────────────────
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

export default TextChat;
