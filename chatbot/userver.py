from flask import Flask, request, jsonify
from datetime import timedelta, datetime
from flask_cors import CORS
from sqlalchemy import create_engine
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
import os
import re
import logging
import time
import uuid
import hashlib
import json
import base64
from typing import Optional, Dict, Tuple, List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ─────────────────────────────────────────────
# Environment & DB setup
# ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMENI_API_KEY")
DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('user')}:{os.getenv('password')}"
    f"@{os.getenv('host')}:{os.getenv('port')}/{os.getenv('dbname')}?sslmode=require"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
)

# These tables are ALWAYS blocked — no session can access them
HARDCODED_RESTRICTED_TABLES = [
    "customers", "orders", "order_items", "owners",
    "refresh_tokens", "wishlist", "users", "payments",
    "auth_tokens", "sessions", "admin"
]

# Full DB connection (used only for schema introspection internally)
_full_db = SQLDatabase(engine, sample_rows_in_table_info=0)

# ── Text LLM (Gemini Flash) ───────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    google_api_key=GEMINI_API_KEY,
    temperature=0.3
)

# ── Vision client (Gemini native client — supports inline images) ─────────────
vision_client = genai.Client(api_key=GEMINI_API_KEY)


# ─────────────────────────────────────────────
# Image Analysis
# ─────────────────────────────────────────────
def analyze_image(image_base64: str, image_context: str, shop_name: str, product_type: str) -> str:
    """
    Analyze an image using Gemini Vision.
    image_base64 : full data-URL (data:image/jpeg;base64,...) or raw base64
    image_context: what the bot asked the user for (e.g. "skin type analysis")
    Returns a plain-text analysis string injected into the orchestrator.
    """
    try:
        # Strip data-URL prefix if present
        if "," in image_base64:
            header, raw_b64 = image_base64.split(",", 1)
            # Detect mime type from header  e.g. "data:image/png;base64"
            mime_type = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
        else:
            raw_b64 = image_base64
            mime_type = "image/jpeg"

        image_bytes = base64.b64decode(raw_b64)

        prompt = f"""You are a retail assistant for '{shop_name}' specializing in {product_type}.
The customer shared an image in the context of: "{image_context}"

Analyze the image carefully and provide:
1. What you clearly observe in the image
2. Specific attributes relevant to {product_type} (e.g. for cosmetics: skin type, tone, concerns; for fashion: style, color, size estimate; for electronics: model, condition, brand)
3. Concrete product recommendations based on what you see

Be specific, helpful, and retail-focused. Do not guess beyond what is visible."""

        response = vision_client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[
                types.Content(parts=[
                    types.Part(text=prompt),
                    types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_bytes))
                ])
            ]
        )

        analysis = response.text.strip()
        logger.info(f"Image analysis complete ({len(image_bytes)//1024}KB): {analysis[:120]}...")
        return analysis

    except Exception as e:
        logger.error(f"Image analysis error: {e}")
        return f"IMAGE_ANALYSIS_FAILED: {str(e)}"


# ─────────────────────────────────────────────
# Security Layer — ALL SQL goes through this
# ─────────────────────────────────────────────

def get_all_db_tables() -> list[str]:
    """Get every table name that actually exists in the database, with retry."""
    import sqlalchemy
    for attempt in range(3):
        try:
            with engine.connect() as conn:
                result = conn.execute(
                    sqlalchemy.text(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                    )
                )
                return [row[0] for row in result]
        except Exception as e:
            logger.warning(f"get_all_db_tables attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error("All retries exhausted for get_all_db_tables")
                return []


def clean_sql(text: str) -> str:
    """Strip markdown fences from LLM SQL output."""
    text = text if isinstance(text, str) else text.get("query", "")
    cleaned = re.sub(r"```(?:sql|postgresql)?\s*([\s\S]*?)\s*```", r"\1", text).strip()
    return cleaned.rstrip(";").strip()


def extract_tables_from_sql(sql: str) -> list[str]:
    """Extract all table names referenced in a SQL query."""
    sql_upper = sql.upper()
    forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"]
    for kw in forbidden_keywords:
        if re.search(rf'\b{kw}\b', sql_upper):
            logger.warning(f"SECURITY: Blocked forbidden keyword '{kw}' in SQL")
            return None
    pattern = r'\b(?:FROM|JOIN|UPDATE|INTO)\s+(["\']?[\w]+["\']?)'
    matches = re.findall(pattern, sql, re.IGNORECASE)
    return [m.strip('"\'').lower() for m in matches]


def validate_and_execute_sql(sql: str, allowed_table: str) -> str:
    """Hard security gate: only allows SELECT on the session's assigned table."""
    sql = clean_sql(sql)
    if not sql:
        return "NO_QUERY"

    if not sql.strip().upper().startswith("SELECT"):
        logger.warning(f"SECURITY BLOCK: Non-SELECT query attempted: {sql[:80]}")
        return "BLOCKED: Only SELECT queries are permitted."

    referenced_tables = extract_tables_from_sql(sql)
    if referenced_tables is None:
        return "BLOCKED: This operation is not permitted."

    allowed_lower = allowed_table.lower()
    for table in referenced_tables:
        if table in [t.lower() for t in HARDCODED_RESTRICTED_TABLES]:
            logger.warning(f"SECURITY BLOCK: Attempted access to restricted table '{table}'")
            return f"BLOCKED: Access to '{table}' is not permitted."
        if table != allowed_lower:
            logger.warning(f"SECURITY BLOCK: Table '{table}' != allowed '{allowed_lower}'")
            return f"BLOCKED: Access to '{table}' is not allowed in this session."

    existing_tables = get_all_db_tables()
    if allowed_lower not in [t.lower() for t in existing_tables]:
        logger.error(f"TABLE NOT FOUND: '{allowed_lower}' does not exist in DB")
        return f"TABLE_NOT_FOUND: The table '{allowed_lower}' does not exist."

    for attempt in range(3):
        try:
            session_db = SQLDatabase(engine, include_tables=[allowed_lower], sample_rows_in_table_info=0)
            tool = QuerySQLDatabaseTool(db=session_db)
            logger.info(f"EXECUTING (table={allowed_lower}): {sql}")
            result = tool.invoke(sql)
            logger.info(f"RESULT PREVIEW: {str(result)[:300]}")
            return result
        except Exception as e:
            logger.warning(f"SQL execute attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                return f"QUERY_ERROR: {str(e)}"


# ─────────────────────────────────────────────
# Conversation Stages
# ─────────────────────────────────────────────
STAGES = {
    "GREETING":       "User just started or greeted",
    "BROWSING":       "User is exploring products / categories",
    "INTERESTED":     "User expressed interest in specific product(s)",
    "COMPARING":      "User wants to compare products",
    "DECIDING":       "User is close to making a decision",
    "CLOSING":        "User confirmed purchase intent",
    "SUPPORT":        "User has a question about warranty / policy / location",
    "AWAITING_IMAGE": "Bot asked user to upload an image — waiting for it"
}

# ─────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────
ORCHESTRATOR_SYSTEM = """You are ShopMate, an expert conversational retail sales assistant.

## YOUR SHOP CONTEXT
- Shop: {shop_name}
- Location: {city}, {state}, {country}
- Product Category: {product_type}
- Shop ID: {shop_id}
- Available DB Table: {table_name}
- DB Schema Info: {db_schema}

## CONVERSATION STATE
- Current Stage: {stage}
- Conversation History:
{history}

## IMAGE ANALYSIS RESULT (if customer sent an image this turn)
{image_analysis}

## YOUR PERSONALITY
- Warm, knowledgeable, proactive salesperson
- You remember everything said earlier in the conversation
- You naturally guide users toward purchase decisions
- You compare products intelligently and make recommendations
- You highlight deals, warranties, and value propositions
- You NEVER break character or mention SQL/databases/AI

## SALES FLOW
GREETING → understand what they need
BROWSING → show options, ask clarifying questions
INTERESTED → go deeper on specific product(s), highlight features
COMPARING → compare 2-3 options side by side in plain language
DECIDING → address objections, reinforce value, nudge toward decision
CLOSING → confirm interest, mention next steps (visit store, call, etc.)
SUPPORT → answer policy/warranty/location questions
AWAITING_IMAGE → you already asked for an image, wait patiently

## WHEN TO REQUEST AN IMAGE
Ask the customer to share an image when it would meaningfully help you recommend products.
Examples:
- Cosmetics/skincare: ask for a selfie to identify skin type, tone, or concern
- Fashion: ask for a photo of an outfit they want to match
- Electronics: ask for a photo of a broken/old device for replacement suggestions
- Any product: ask for a photo if the customer struggles to describe what they want

When requesting an image, set "needs_image" to true and "image_context" to what they should photograph.
Set stage to "AWAITING_IMAGE".

## WHAT YOU MUST DO
1. Analyze user message + conversation history + image analysis (if any)
2. Decide the next conversation STAGE
3. Decide if you need DB data (needs_sql) or an image (needs_image)
4. If needs_sql: write a precise PostgreSQL query scoped to this shop only
5. Formulate a warm, helpful, sales-oriented response

## SQL RULES (CRITICAL)
- ONLY query table: {table_name}
- NEVER use = for text columns. Use: lower(col) LIKE lower('%value%')
- ALWAYS add LIMIT 10 unless user asks for specific count
- NEVER access restricted tables: customers, orders, owners, refresh_tokens, wishlist

## WISHLIST HANDLING
When the user asks to add something to their wishlist (e.g. "add MacBook to my wishlist", "save this", "wishlist it"):
- Set needs_wishlist to true
- Set wishlist_keyword to the product name/term they mentioned (e.g. "MacBook", "red dress", "Samsung TV")
- Set needs_sql to false (the server will search products automatically)
- Write a response_template confirming you will show matching products for them to pick

## OUTPUT FORMAT — strict JSON only, no markdown, no extra text
{{
  "stage": "GREETING|BROWSING|INTERESTED|COMPARING|DECIDING|CLOSING|SUPPORT|AWAITING_IMAGE",
  "needs_sql": true|false,
  "sql_query": "SELECT ... FROM {table_name} WHERE ...",
  "needs_image": true|false,
  "image_context": "what you are asking the customer to photograph (null if needs_image=false)",
  "needs_wishlist": true|false,
  "wishlist_keyword": "product name/term to search (null if needs_wishlist=false)",
  "thinking": "brief internal reasoning",
  "response_template": "your response to the user (put [SQL_RESULTS] where DB data goes if needs_sql=true)"
}}
"""

RESPONSE_FORMATTER_PROMPT = """You are ShopMate, a warm retail assistant.
Shop: {shop_name} | Location: {city}, {state}

Plan:
- Thinking: {thinking}
- Stage: {stage}
- Template: {response_template}

SQL Results: {sql_results}
Image Analysis: {image_analysis}

Write the FINAL response to: "{user_message}"

## CRITICAL RULES — NEVER BREAK THESE:
1. ONLY use product data from SQL Results above. NEVER invent, assume, or recall products from your training data.
2. If SQL Results is empty, "[NO_RESULTS]", or contains no product rows — you MUST say the product is not available in this shop. Do NOT suggest products that are not in the SQL Results.
3. If SQL Results has data — use ONLY those exact products, prices, and details. Do not add extra products.
4. NEVER say things like "we have the MacBook Pro" unless that exact product appears in SQL Results.
5. If you are unsure whether a product exists in the shop — say you'll check and ask the customer to rephrase.

## FORMAT RULES:
- Natural, conversational language
- NO tables, NO pipe characters, NO asterisks
- Use numbered lists or "First... Second... Also..." style
- Highlight prices, features, availability from SQL data naturally
- If image was analyzed, reference what you saw to make it personal
- End with a helpful question or next step
- 2-5 sentences for simple answers, more for comparisons
"""



def is_empty_sql_result(result: str) -> bool:
    """
    Detect if a SQL result genuinely has no data rows.
    Handles: empty string, LangChain empty tuple string, whitespace-only, 
    error strings, single-bracket results.
    """
    if not result:
        return True
    r = result.strip()
    # LangChain returns these for empty queries
    empty_patterns = [
        "", "[]", "()", "None", "no results", "0 rows",
        "NO_QUERY", "[]\n", "(\n)"
    ]
    if r.lower() in [p.lower() for p in empty_patterns]:
        return True
    # LangChain tuple format with no data: just header line, no data lines
    lines = [l.strip() for l in r.split("\n") if l.strip()]
    if len(lines) == 0:
        return True
    # All lines are just separators or the result is only punctuation
    if all(set(l) <= set("-+|= ") for l in lines):
        return True
    return False


def search_products_for_wishlist(keyword: str, allowed_table: str) -> list:
    """
    Search shop table for products matching keyword.
    Returns a list of dicts: [{product_id, product_name, price, ...}]
    Uses safe parameterized query — NOT through LLM SQL gate.
    """
    import sqlalchemy
    # Determine which columns to fetch — try common names
    try:
        existing = [t.lower() for t in get_all_db_tables()]
        if allowed_table.lower() not in existing:
            return []

        # Introspect actual columns
        with engine.connect() as conn:
            col_result = conn.execute(sqlalchemy.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t AND table_schema = 'public' ORDER BY ordinal_position"
            ), {"t": allowed_table.lower()})
            columns = [r[0] for r in col_result]

        # Find the id column (first col with 'id' in name)
        id_col   = next((c for c in columns if c.lower() in ('id', 'product_id')), columns[0])
        # Find name column
        name_col = next((c for c in columns if 'name' in c.lower()), None)
        if not name_col:
            return []
        # Find price column if exists
        price_col = next((c for c in columns if 'price' in c.lower()), None)
        # Find brand column if exists
        brand_col = next((c for c in columns if 'brand' in c.lower()), None)
        # Find description column if exists
        desc_col  = next((c for c in columns if 'desc' in c.lower()), None)

        select_cols = [id_col, name_col]
        if price_col: select_cols.append(price_col)
        if brand_col: select_cols.append(brand_col)
        if desc_col:  select_cols.append(desc_col)

        select_str = ", ".join(select_cols)
        safe_table = allowed_table.lower().replace('"', '').replace("'", "")

        sql = sqlalchemy.text(
            f"SELECT {select_str} FROM {safe_table} "
            f"WHERE lower({name_col}) LIKE lower(:kw) LIMIT 8"
        )

        with engine.connect() as conn:
            rows = conn.execute(sql, {"kw": f"%{keyword}%"}).fetchall()

        results = []
        for row in rows:
            d = dict(zip(select_cols, row))
            results.append({
                "product_id":   d.get(id_col),
                "product_name": d.get(name_col),
                "price":        d.get(price_col) if price_col else None,
                "brand":        d.get(brand_col) if brand_col else None,
                "description":  str(d.get(desc_col, ""))[:100] if desc_col else None,
            })
        logger.info(f"Wishlist search '{keyword}' on {safe_table}: {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"search_products_for_wishlist error: {e}")
        return []

# ─────────────────────────────────────────────
# Conversational Agent
# ─────────────────────────────────────────────
class ConversationalAgent:
    """Manages a full conversational retail session — strictly scoped to one table."""

    def __init__(self, session_data: dict):
        self.session = session_data

    @property
    def table_name(self) -> str:
        pt  = (self.session.get("productType") or "products").lower().strip().replace(" ", "_")
        sid = str(self.session.get("shop_id") or "0")
        sn  = (self.session.get("shopName") or "shop").lower().strip().replace(" ", "_")
        return f"{pt}_{sid}_{sn}"

    @property
    def history_text(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "(No previous messages — start of conversation)"
        lines = []
        for i, msg in enumerate(history[-8:], 1):
            lines.append(f"  [{i}] User: {msg.get('content', '')}")
            if msg.get("had_image"):
                lines.append(f"       [User sent an image: {msg.get('image_context', 'image')}]")
            lines.append(f"       Assistant: {msg.get('response', '')}")
        return "\n".join(lines)

    @property
    def current_stage(self) -> str:
        history = self.session.get("chat_history", [])
        if not history:
            return "GREETING"
        return history[-1].get("stage", "BROWSING")

    def get_scoped_schema(self) -> str:
        """Return schema for ONLY the session's assigned table."""
        allowed = self.table_name.lower()
        for attempt in range(3):
            try:
                existing = [t.lower() for t in get_all_db_tables()]
                if not existing:
                    if attempt < 2:
                        time.sleep(1)
                        continue
                    return "Could not connect to database after retries."
                if allowed not in existing:
                    return f"Table '{allowed}' not found in database."
                scoped_db = SQLDatabase(engine, include_tables=[allowed], sample_rows_in_table_info=2)
                return scoped_db.get_table_info()
            except Exception as e:
                logger.warning(f"get_scoped_schema attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(1)
                else:
                    return f"Could not retrieve schema for table '{allowed}'."

    def orchestrate(self, user_message: str, image_base64: Optional[str] = None) -> dict:
        """
        Main entry point.
        Returns dict: { "text": str, "needs_image": bool, "image_context": str|None }
        """
        allowed_table  = self.table_name
        scoped_schema  = self.get_scoped_schema()

        # ── Step 1: Analyze image if provided ───────────────────────────
        image_analysis = ""
        image_context_used = ""

        if image_base64:
            # Determine context: what did the bot ask for?
            last = self.session.get("chat_history", [])
            image_context_used = (
                last[-1].get("image_context", "general product identification")
                if last else "general product identification"
            )
            logger.info(f"Analyzing image in context: {image_context_used}")
            image_analysis = analyze_image(
                image_base64,
                image_context_used,
                self.session.get("shopName", "Our Shop"),
                self.session.get("productType", "products")
            )

        # ── Step 2: LLM plans the response ──────────────────────────────
        system_prompt = ORCHESTRATOR_SYSTEM.format(
            shop_name    = self.session.get("shopName", "Our Shop"),
            city         = self.session.get("city", ""),
            state        = self.session.get("state", ""),
            country      = self.session.get("country", ""),
            product_type = self.session.get("productType", "all products"),
            shop_id      = self.session.get("shop_id", ""),
            table_name   = allowed_table,
            db_schema    = scoped_schema,
            stage        = self.current_stage,
            history      = self.history_text,
            image_analysis = image_analysis if image_analysis else "(No image provided this turn)"
        )

        plan_response = llm.invoke([
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message}
        ])

        plan = self._parse_plan(plan_response.content)
        logger.info(
            f"Plan → stage={plan.get('stage')}, "
            f"needs_sql={plan.get('needs_sql')}, "
            f"needs_image={plan.get('needs_image')}, "
            f"thinking={plan.get('thinking','')[:80]}"
        )

        # ── Step 3: Execute SQL through security gate ────────────────────
        sql_results = ""
        sql_was_empty = False

        if plan.get("needs_sql") and plan.get("sql_query"):
            sql_results = validate_and_execute_sql(plan["sql_query"], allowed_table)
            if sql_results.startswith("BLOCKED") or sql_results.startswith("TABLE_NOT_FOUND"):
                logger.warning(f"SQL blocked: {sql_results}")
                sql_results = "[NO_RESULTS: Data access blocked]"
                sql_was_empty = True
            elif sql_results.startswith("QUERY_ERROR"):
                logger.error(f"SQL error: {sql_results}")
                sql_results = "[NO_RESULTS: Query failed]"
                sql_was_empty = True
            elif is_empty_sql_result(sql_results):
                logger.info("SQL returned empty result — flagging for honest response")
                sql_results = "[NO_RESULTS: This product or category was not found in this shop's inventory]"
                sql_was_empty = True
            else:
                logger.info(f"SQL returned data: {sql_results[:120]}")

        # ── Step 3b: Wishlist product search (controlled, not LLM SQL gate) ───
        wishlist_products = []
        if plan.get("needs_wishlist") and plan.get("wishlist_keyword"):
            keyword = plan["wishlist_keyword"]
            wishlist_products = search_products_for_wishlist(keyword, allowed_table)
            logger.info(f"Wishlist intent detected: keyword='{keyword}', found={len(wishlist_products)}")

        # ── Step 4: Format final conversational response ─────────────────
        # If SQL was empty, prepend a hard instruction so LLM cannot hallucinate
        empty_guard = (
            "IMPORTANT: The database returned NO results for this query. "
            "You MUST tell the customer this product is not available in this shop. "
            "Do NOT mention or suggest any specific product names, models, or prices. "
            "Only offer to help them find something else that IS in stock.\n\n"
            if sql_was_empty else ""
        )

        formatter_prompt = empty_guard + RESPONSE_FORMATTER_PROMPT.format(
            shop_name      = self.session.get("shopName", "Our Shop"),
            city           = self.session.get("city", ""),
            state          = self.session.get("state", ""),
            response_template = plan.get("response_template", ""),
            thinking       = plan.get("thinking", ""),
            stage          = plan.get("stage", "BROWSING"),
            sql_results    = sql_results if sql_results else "No DB query needed.",
            image_analysis = image_analysis if image_analysis else "No image this turn.",
            user_message   = user_message
        )

        final        = llm.invoke([{"role": "user", "content": formatter_prompt}])
        response_text = final.content.strip()

        # ── Step 5: Persist to history ───────────────────────────────────
        self.session["chat_history"].append({
            "role":          "user",
            "content":       user_message,
            "response":      response_text,
            "stage":         plan.get("stage", "BROWSING"),
            "had_sql":       bool(sql_results),
            "had_image":     bool(image_base64),
            "image_context": plan.get("image_context") or image_context_used,
            "timestamp":     datetime.now().isoformat()
        })
        self.session["current_stage"] = plan.get("stage", "BROWSING")

        return {
            "text":             response_text,
            "needs_image":      bool(plan.get("needs_image")),
            "image_context":    plan.get("image_context") or None,
            "needs_wishlist":   bool(plan.get("needs_wishlist")),
            "wishlist_keyword": plan.get("wishlist_keyword") or None,
            "wishlist_products": wishlist_products
        }

    def _parse_plan(self, content: str) -> dict:
        try:
            clean = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", content).strip()
            return json.loads(clean)
        except json.JSONDecodeError:
            logger.warning("Failed to parse plan JSON — using fallback")
            return {
                "stage":             self.current_stage,
                "needs_sql":         False,
                "sql_query":         None,
                "needs_image":       False,
                "image_context":     None,
                "thinking":          "JSON parse failed",
                "response_template": content
            }


# ─────────────────────────────────────────────
# Flask App
# ─────────────────────────────────────────────
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["*"])
app.secret_key = "shopmate123"
app.permanent_session_lifetime = timedelta(hours=1)

RATE_LIMIT_SECONDS = 2
SESSION_TIMEOUT    = 3600

_last_request_time      = datetime.min
_last_request_text_hash: Optional[str] = None
chat_sessions: Dict[str, Dict] = {}

# ─────────────────────────────────────────────
# Conversation Analysis — DB persistence
# ─────────────────────────────────────────────

def save_analysis_to_db(record: dict) -> Optional[int]:
    """
    Insert one conversation analysis record into conversation_analyses table.
    Returns the new row id, or None on failure.
    """
    import sqlalchemy
    sql = sqlalchemy.text("""
        INSERT INTO conversation_analyses (
            session_id, user_id, shop_id, shop_name,
            city, state, country, product_type,
            started_at, ended_at, duration_minutes, turn_count,
            outcome, final_stage, summary, customer_intent,
            sentiment_arc, stage_progression,
            products_discussed, key_insights,
            missed_opportunities, recommended_followup,
            images_shared, sql_queries_made,
            stages_reached, full_analysis, conversation_transcript
        ) VALUES (
            :session_id, :user_id, :shop_id, :shop_name,
            :city, :state, :country, :product_type,
            :started_at, :ended_at, :duration_minutes, :turn_count,
            :outcome, :final_stage, :summary, :customer_intent,
            :sentiment_arc, :stage_progression,
            :products_discussed, :key_insights,
            :missed_opportunities, :recommended_followup,
            :images_shared, :sql_queries_made,
            :stages_reached, :full_analysis, :conversation_transcript
        )
        RETURNING id
    """)

    metrics = record.get("analysis", {}).get("metrics", {})
    a       = record.get("analysis", {})

    params = {
        "session_id":             record.get("session_id"),
        "user_id":                record.get("user_id"),
        "shop_id":                str(record.get("shop_id", "")),
        "shop_name":              record.get("shop_name"),
        "city":                   record.get("city"),
        "state":                  record.get("state"),
        "country":                record.get("country"),
        "product_type":           record.get("product_type"),
        "started_at":             record.get("started_at"),
        "ended_at":               record.get("ended_at"),
        "duration_minutes":       record.get("duration_minutes", 0),
        "turn_count":             record.get("turn_count", 0),
        "outcome":                a.get("outcome", "UNKNOWN"),
        "final_stage":            a.get("final_stage", "UNKNOWN"),
        "summary":                a.get("summary", ""),
        "customer_intent":        a.get("customer_intent", ""),
        "sentiment_arc":          a.get("sentiment_arc", ""),
        "stage_progression":      metrics.get("stage_progression", ""),
        "products_discussed":     json.dumps(a.get("products_discussed", [])),
        "key_insights":           json.dumps(a.get("key_insights", [])),
        "missed_opportunities":   json.dumps(a.get("missed_opportunities", [])),
        "recommended_followup":   a.get("recommended_followup", ""),
        "images_shared":          metrics.get("images_shared", 0),
        "sql_queries_made":       metrics.get("sql_queries_made", 0),
        "stages_reached":         json.dumps(metrics.get("stages_reached", [])),
        "full_analysis":          json.dumps(a),
        "conversation_transcript":json.dumps(record.get("conversation", []))
    }

    for attempt in range(3):
        try:
            with engine.begin() as conn:
                result = conn.execute(sql, params)
                row_id = result.fetchone()[0]
                logger.info(f"Analysis saved to DB: id={row_id}, session={record.get('session_id','')[:8]}")
                return row_id
        except Exception as e:
            logger.warning(f"save_analysis_to_db attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(1)
            else:
                logger.error(f"Failed to save analysis after 3 attempts: {e}")
                return None


def fetch_analyses_from_db(shop_id: Optional[str] = None, limit: int = 100) -> list:
    """Fetch analyses from DB, optionally filtered by shop_id."""
    import sqlalchemy
    try:
        if shop_id:
            sql = sqlalchemy.text("""
                SELECT id, session_id, user_id, shop_id, shop_name, city, state,
                       started_at, ended_at, duration_minutes, turn_count,
                       outcome, final_stage, summary, customer_intent,
                       sentiment_arc, products_discussed, key_insights,
                       recommended_followup, created_at
                FROM conversation_analyses
                WHERE shop_id = :shop_id
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            params = {"shop_id": str(shop_id), "limit": limit}
        else:
            sql = sqlalchemy.text("""
                SELECT id, session_id, user_id, shop_id, shop_name, city, state,
                       started_at, ended_at, duration_minutes, turn_count,
                       outcome, final_stage, summary, customer_intent,
                       sentiment_arc, products_discussed, key_insights,
                       recommended_followup, created_at
                FROM conversation_analyses
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            params = {"limit": limit}

        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error(f"fetch_analyses_from_db error: {e}")
        return []


def fetch_analyses_stats_from_db(shop_id: Optional[str] = None) -> dict:
    """Aggregate stats directly from DB."""
    import sqlalchemy
    try:
        where = "WHERE shop_id = :shop_id" if shop_id else ""
        sql = sqlalchemy.text(f"""
            SELECT
                COUNT(*)                                        AS total_conversations,
                ROUND(AVG(duration_minutes)::numeric, 1)        AS avg_duration_minutes,
                ROUND(AVG(turn_count)::numeric, 1)              AS avg_turns,
                SUM(images_shared)                              AS total_images_shared,
                outcome,
                COUNT(*) OVER (PARTITION BY outcome)            AS outcome_count
            FROM conversation_analyses
            {where}
            GROUP BY outcome
        """)
        params = {"shop_id": str(shop_id)} if shop_id else {}

        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            if not rows:
                return {}

            first = dict(rows[0]._mapping)
            outcomes = {dict(r._mapping)["outcome"]: dict(r._mapping)["outcome_count"] for r in rows}
            return {
                "total_conversations": first["total_conversations"],
                "avg_duration_minutes": float(first["avg_duration_minutes"] or 0),
                "avg_turns": float(first["avg_turns"] or 0),
                "total_images_shared": first["total_images_shared"] or 0,
                "outcome_breakdown": outcomes
            }
    except Exception as e:
        logger.error(f"fetch_analyses_stats_from_db error: {e}")
        return {}




def is_rate_limited(text: str) -> bool:
    global _last_request_time, _last_request_text_hash
    current_time = datetime.now()
    text_hash    = hashlib.md5(text.encode()).hexdigest()
    time_diff    = (current_time - _last_request_time).total_seconds()
    if time_diff < RATE_LIMIT_SECONDS:
        return True
    if text_hash == _last_request_text_hash:
        return True
    _last_request_time      = current_time
    _last_request_text_hash = text_hash
    return False


def cleanup_old_sessions() -> int:
    current_time = time.time()
    to_remove = [
        sid for sid, data in chat_sessions.items()
        if current_time - data.get("last_active", 0) > SESSION_TIMEOUT
    ]
    for sid in to_remove:
        del chat_sessions[sid]
    return len(to_remove)


def get_session_data(session_id: Optional[str] = None) -> Tuple[Optional[Dict], str]:
    if session_id is None:
        session_id = (request.headers.get('X-Session-ID') or
                      request.args.get('session_id'))
    if not session_id:
        return None, str(uuid.uuid4())

    if chat_sessions and hash(session_id) % 10 == 0:
        cleanup_old_sessions()

    if session_id not in chat_sessions:
        chat_sessions[session_id] = {
            "chat_history":  [],
            "shopName":      None,
            "city":          None,
            "state":         None,
            "country":       None,
            "productType":   None,
            "shop_id":       None,
            "current_stage": "GREETING",
            "last_active":   time.time()
        }
    else:
        chat_sessions[session_id]["last_active"] = time.time()

    return chat_sessions[session_id], session_id


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.route("/start-chat", methods=["POST"])
def start_chat():
    data = request.get_json()
    session_id = (
        request.headers.get('X-Session-ID') or
        request.args.get('session_id') or
        (data.get("session_id") if data else None) or
        str(uuid.uuid4())
    )

    session_data, returned_session_id = get_session_data(session_id)
    if session_data is None:
        session_data, returned_session_id = get_session_data()

    form_data = data.get("formData", {}) if data else {}
    session_data.update({
        "shopName":      form_data.get("shopName"),
        "city":          form_data.get("city"),
        "state":         form_data.get("state"),
        "country":       form_data.get("country"),
        "productType":   form_data.get("productType"),
        "shop_id":       form_data.get("shopId"),
        "chat_history":  [],
        "current_stage": "GREETING"
    })

    shop_name    = session_data.get("shopName", "the store")
    product_type = session_data.get("productType", "products")
    city         = session_data.get("city", "")

    welcome_llm = llm.invoke([{
        "role": "user",
        "content": (
            f"You are ShopMate, a retail assistant for '{shop_name}' in {city} "
            f"specializing in {product_type}. "
            f"Give a warm, brief (2-3 sentences) welcome message: "
            f"1) Greet warmly, 2) Mention shop name and specialty, "
            f"3) Ask what they're looking for. Be natural, not robotic."
        )
    }])
    welcome_message = welcome_llm.content.strip()
    logger.info(f"Session started: {shop_name} in {city}")

    return jsonify({
        "message":    "Chat session started",
        "session_id": returned_session_id,
        "welcome":    welcome_message,
        "shop":       shop_name,
        "location":   f"{city}, {session_data.get('state')}, {session_data.get('country')}"
    }), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    text = (data.get("text", "") or "").strip()
    image_b64 = data.get("image") or None 

    if not text:
        return jsonify({"error": "Empty message"}), 400

    if is_rate_limited(text):
        return jsonify({
            "error":   "Rate limited",
            "message": "Please wait a moment before sending another message"
        }), 429

    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({
            "error":   "No active session",
            "message": "Please call /start-chat first to initialize your session."
        }), 400

    has_image = bool(image_b64)
    logger.info(f"[{session_id[:8]}] User: {text} {'[+IMAGE]' if has_image else ''}")

    agent  = ConversationalAgent(session_data)
    result = agent.orchestrate(text, image_b64)

    logger.info(
        f"[{session_id[:8]}] Stage: {session_data.get('current_stage')} | "
        f"needs_image={result['needs_image']} | "
        f"Response: {result['text'][:100]}..."
    )

    return jsonify({
        "text":              result["text"],
        "needs_image":       result["needs_image"],
        "image_context":     result["image_context"],
        "needs_wishlist":    result.get("needs_wishlist", False),
        "wishlist_keyword":  result.get("wishlist_keyword"),
        "wishlist_products": result.get("wishlist_products", []),
        "stage":             session_data.get("current_stage", "BROWSING"),
        "session_id":        session_id
    }), 200


@app.route("/chat-history", methods=["GET"])
def get_chat_history():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found", "session_id": session_id}), 404
    history = session_data.get("chat_history", [])
    return jsonify({
        "session_id":   session_id,
        "stage":        session_data.get("current_stage"),
        "chat_history": history,
        "count":        len(history)
    }), 200


@app.route("/clear-chat", methods=["POST"])
def clear_chat():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    session_data["chat_history"]  = []
    session_data["current_stage"] = "GREETING"
    return jsonify({"message": "Chat cleared and reset to GREETING stage"}), 200


@app.route("/get-session", methods=["GET"])
def get_session():
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404
    return jsonify({
        "session_id":         session_id,
        "shopName":           session_data.get("shopName"),
        "city":               session_data.get("city"),
        "state":              session_data.get("state"),
        "country":            session_data.get("country"),
        "productType":        session_data.get("productType"),
        "shop_id":            session_data.get("shop_id"),
        "current_stage":      session_data.get("current_stage"),
        "chat_history_count": len(session_data.get("chat_history", [])),
        "active_sessions":    len(chat_sessions)
    }), 200


@app.route("/sessions/status", methods=["GET"])
def sessions_status():
    return jsonify({
        "total_sessions": len(chat_sessions),
        "sessions": {
            sid[:8] + "...": {
                "shop":          data.get("shopName"),
                "city":          data.get("city"),
                "stage":         data.get("current_stage"),
                "history_count": len(data.get("chat_history", [])),
                "last_active":   datetime.fromtimestamp(data.get("last_active", 0)).isoformat()
            }
            for sid, data in chat_sessions.items()
        }
    }), 200


@app.route("/cleanup-sessions", methods=["POST"])
def cleanup_sessions_route():
    count = cleanup_old_sessions()
    return jsonify({"cleaned": count, "remaining": len(chat_sessions)}), 200


@app.route("/transcribe/status", methods=["GET"])
def transcribe_status():
    global _last_request_time
    current_time = datetime.now()
    time_diff    = (current_time - _last_request_time).total_seconds()
    return jsonify({
        "rate_limited":     time_diff < RATE_LIMIT_SECONDS,
        "cooldown_seconds": max(0, RATE_LIMIT_SECONDS - time_diff)
    }), 200


@app.route("/debug/table", methods=["GET"])
def debug_table():
    session_data, session_id = get_session_data()
    if session_data is None or not session_data.get("shopName"):
        return jsonify({"error": "No active session"}), 400
    agent    = ConversationalAgent(session_data)
    table    = agent.table_name
    existing = get_all_db_tables()
    exists   = table.lower() in [t.lower() for t in existing]
    return jsonify({
        "session_id":        session_id,
        "assigned_table":    table,
        "table_exists_in_db": exists,
        "schema_preview":    agent.get_scoped_schema() if exists else "Table not found",
        "all_db_tables_count": len(existing)
    }), 200



ANALYSIS_PROMPT = """You are a retail analytics expert. Analyze this conversation between a customer and a retail assistant.

Shop: {shop_name} ({shop_id})
Location: {city}, {state}, {country}
Product Category: {product_type}
Session ID: {session_id}
Duration: {duration_minutes} minutes
Total Turns: {turn_count}

Conversation:
{conversation_text}

Provide a structured JSON analysis with EXACTLY this format (no markdown, raw JSON only):
{{
  "summary": "2-3 sentence plain English summary of what happened in the conversation",
  "outcome": "PURCHASED_INTENT | BROWSED_ONLY | ABANDONED | SUPPORT_RESOLVED | UNDECIDED",
  "final_stage": "the last stage reached in the sales funnel",
  "metrics": {{
    "turns": {turn_count},
    "duration_minutes": {duration_minutes},
    "images_shared": {images_shared},
    "sql_queries_made": {sql_queries},
    "stages_reached": [],
    "stage_progression": "linear | jumped_around | stalled"
  }},
  "customer_intent": "what the customer was actually looking for",
  "products_discussed": ["list of specific products or categories mentioned"],
  "key_insights": [
    "insight 1 about customer behavior or preference",
    "insight 2",
    "insight 3"
  ],
  "missed_opportunities": ["things the bot could have done better"],
  "sentiment_arc": "started_positive | started_negative | improved | declined | neutral_throughout",
  "recommended_followup": "what a human sales agent should do if this customer visits the store"
}}"""


@app.route("/analyze-session", methods=["POST"])
def analyze_session():
    """
    Called when user closes the voice UI.
    Generates a full conversation analysis and stores it in the global list.
    """
    session_data, session_id = get_session_data()
    if session_data is None:
        return jsonify({"error": "No session found"}), 404

    chat_history = session_data.get("chat_history", [])
    if not chat_history:
        return jsonify({"message": "No conversation to analyze", "analysis": None}), 200

    # ── Build conversation text ──────────────────────────────────────────
    conversation_lines = []
    for i, msg in enumerate(chat_history, 1):
        conversation_lines.append(f"Turn {i}:")
        conversation_lines.append(f"  Customer: {msg.get('content', '')}")
        if msg.get("had_image"):
            conversation_lines.append(f"  [Customer sent image: {msg.get('image_context', '')}]")
        conversation_lines.append(f"  Assistant: {msg.get('response', '')}")
        conversation_lines.append(f"  [Stage: {msg.get('stage', '?')}]")
        conversation_lines.append("")
    conversation_text = "\n".join(conversation_lines)

    # ── Calculate metrics ────────────────────────────────────────────────
    turn_count      = len(chat_history)
    images_shared   = sum(1 for m in chat_history if m.get("had_image"))
    sql_queries     = sum(1 for m in chat_history if m.get("had_sql"))
    stages_reached  = list(dict.fromkeys([m.get("stage", "UNKNOWN") for m in chat_history]))

    # Duration from first to last message
    try:
        t_first = datetime.fromisoformat(chat_history[0].get("timestamp", datetime.now().isoformat()))
        t_last  = datetime.fromisoformat(chat_history[-1].get("timestamp", datetime.now().isoformat()))
        duration_minutes = round((t_last - t_first).total_seconds() / 60, 1)
    except Exception:
        duration_minutes = 0

    # ── Call LLM for analysis ────────────────────────────────────────────
    try:
        prompt = ANALYSIS_PROMPT.format(
            shop_name        = session_data.get("shopName", "Unknown"),
            shop_id          = session_data.get("shop_id", "Unknown"),
            city             = session_data.get("city", ""),
            state            = session_data.get("state", ""),
            country          = session_data.get("country", ""),
            product_type     = session_data.get("productType", ""),
            session_id       = session_id,
            duration_minutes = duration_minutes,
            turn_count       = turn_count,
            images_shared    = images_shared,
            sql_queries      = sql_queries,
            conversation_text= conversation_text
        )

        response     = llm.invoke([{"role": "user", "content": prompt}])
        raw          = response.content.strip()
        clean        = re.sub(r"```(?:json)?\s*([\s\S]*?)\s*```", r"\1", raw).strip()
        llm_analysis = json.loads(clean)

        # Patch stages_reached from actual data (LLM sometimes hallucinates)
        llm_analysis["metrics"]["stages_reached"] = stages_reached

    except Exception as e:
        logger.error(f"Analysis LLM error: {e}")
        llm_analysis = {
            "summary": "Analysis failed — raw conversation stored.",
            "outcome": "UNKNOWN",
            "final_stage": session_data.get("current_stage", "UNKNOWN"),
            "metrics": {
                "turns": turn_count,
                "duration_minutes": duration_minutes,
                "images_shared": images_shared,
                "sql_queries_made": sql_queries,
                "stages_reached": stages_reached,
                "stage_progression": "unknown"
            },
            "customer_intent": "unknown",
            "products_discussed": [],
            "key_insights": [],
            "missed_opportunities": [],
            "sentiment_arc": "unknown",
            "recommended_followup": "Review conversation manually."
        }

    # ── Build full record ────────────────────────────────────────────────
    record = {
        "session_id":    session_id,
        "user_id":       session_data.get("user_id") or session_id[:8],
        "shop_id":       session_data.get("shop_id"),
        "shop_name":     session_data.get("shopName"),
        "city":          session_data.get("city"),
        "state":         session_data.get("state"),
        "country":       session_data.get("country"),
        "product_type":  session_data.get("productType"),
        "started_at":    chat_history[0].get("timestamp") if chat_history else datetime.now().isoformat(),
        "ended_at":      datetime.now().isoformat(),
        "duration_minutes": duration_minutes,
        "turn_count":    turn_count,
        "analysis":      llm_analysis,
        "conversation":  chat_history   # full transcript attached
    }

    # ── Save to database ────────────────────────────────────────────────
    db_id = save_analysis_to_db(record)

    # ── Clear session after saving ───────────────────────────────────────
    session_data["chat_history"]  = []
    session_data["current_stage"] = "GREETING"
    logger.info(
        f"Analysis saved (db_id={db_id}) + session cleared | "
        f"session={session_id[:8]} | shop={record['shop_name']} | "
        f"outcome={llm_analysis.get('outcome')} | turns={turn_count}"
    )

    return jsonify({
        "message":    "Analysis complete and session cleared",
        "session_id": session_id,
        "db_id":      db_id,
        "analysis":   llm_analysis
    }), 200


@app.route("/analyses", methods=["GET"])
def get_all_analyses():
    """Return analyses from DB, optionally filtered by shop_id."""
    shop_id = request.args.get("shop_id")
    limit   = int(request.args.get("limit", 100))
    rows    = fetch_analyses_from_db(shop_id=shop_id, limit=limit)

    # Deserialise JSON string columns for response
    for r in rows:
        for col in ("products_discussed", "key_insights"):
            if isinstance(r.get(col), str):
                try:
                    r[col] = json.loads(r[col])
                except Exception:
                    r[col] = []
        # Convert datetime objects to ISO strings
        for col in ("started_at", "ended_at", "created_at"):
            if r.get(col) and not isinstance(r[col], str):
                r[col] = r[col].isoformat()

    return jsonify({
        "total":    len(rows),
        "analyses": rows
    }), 200


@app.route("/analyses/<session_id_or_id>", methods=["GET"])
def get_analysis_detail(session_id_or_id):
    """Return full analysis by DB id or session_id."""
    import sqlalchemy
    try:
        # Try numeric id first
        try:
            row_id = int(session_id_or_id)
            sql = sqlalchemy.text("SELECT * FROM conversation_analyses WHERE id = :id")
            params = {"id": row_id}
        except ValueError:
            sql = sqlalchemy.text("SELECT * FROM conversation_analyses WHERE session_id = :sid")
            params = {"sid": session_id_or_id}

        with engine.connect() as conn:
            row = conn.execute(sql, params).fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404
            record = dict(row._mapping)
            # Deserialise JSON columns
            for col in ("products_discussed", "key_insights", "missed_opportunities",
                        "stages_reached", "full_analysis", "conversation_transcript"):
                if isinstance(record.get(col), str):
                    try:
                        record[col] = json.loads(record[col])
                    except Exception:
                        pass
            # Datetime to string
            for col in ("started_at", "ended_at", "created_at"):
                if record.get(col) and not isinstance(record[col], str):
                    record[col] = record[col].isoformat()
            return jsonify(record), 200
    except Exception as e:
        logger.error(f"get_analysis_detail error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/analyses/stats", methods=["GET"])
def get_analyses_stats():
    """Aggregate stats from DB."""
    shop_id = request.args.get("shop_id")
    stats   = fetch_analyses_stats_from_db(shop_id=shop_id)
    if not stats:
        return jsonify({"message": "No analyses yet"}), 200
    return jsonify(stats), 200



@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ShopMate Conversational AI is running"}), 200


if __name__ == "__main__":
    logger.info("Starting ShopMate Conversational Retail Assistant")
    app.run(port=os.getenv("PORT_SERVER") or 3000, debug=True)