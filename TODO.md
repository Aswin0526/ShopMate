# Implementation Plan for ShopMate Chatbot Backend

## Task: Fix session management and chat history handling in chatbot/server.py

### Issues Identified:
1. **ValueError in format_history_for_context**: Function tries to unpack `(question, response)` from dict items instead of extracting from keys
2. **Inefficient session initialization**: System instruction sent to chat unnecessarily
3. **Mixed session handling**: Some code uses Flask session, some uses `chat_sessions` dict

### Changes to Implement:

#### 1. Fix `format_history_for_context()` function
- Change from tuple unpacking to dict key extraction
- Extract `content` and `response` keys from history items

#### 2. Remove system instruction from chat_history
- Don't append general instruction to `chat_history`
- Keep it only in session context

#### 3. Simplify `/start-chat` endpoint
- Store shop info directly in `chat_sessions[session_id]`
- Initialize chat/client objects in `chat_sessions` dict
- **Remove** the line: `response = session_data["chat"].send_message(general_instruction)`
- System instruction will be used in prompts, not sent to chat

#### 4. Keep session data structure in `chat_sessions`:
```python
chat_sessions[session_id] = {
    "client": genai.Client(api_key=GEMENI_API_KEY),
    "chat": session_data["client"].chats.create(model="gemini-2.5-flash-lite"),
    "shopName": form_data.get("shopName"),
    "city": form_data.get("city"),
    "state": form_data.get("state"),
    "country": form_data.get("country"),
    "productType": form_data.get("productType"),
    "shop_id": form_data.get("shopId"),  # Add this
    "chat_history": [],  # Only user/assistant messages, no system
    "last_active": time.time()
}
```

#### 5. Update all functions to read from `chat_sessions` dict
- `get_general_instruction()` 
- `small_talk()`
- `out_of_domain()`
- `data_query()`

### Expected Outcome:
- No more ValueError when formatting chat history
- Cleaner session management
- More efficient chat initialization
- Better separation of session data vs chat history
