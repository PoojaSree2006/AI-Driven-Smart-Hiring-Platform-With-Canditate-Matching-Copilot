# backend/test_gemini.py
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

key = os.getenv("GEMINI_API_KEY")
print(f"Loaded Key: {key[:10]}... (length: {len(key) if key else 0})")

if not key:
    print("❌ No API key found in .env file.")
    exit()

try:
    genai.configure(api_key=key)
    # Use the exact model name from your curl command
    model = genai.GenerativeModel("gemini-flash-latest")
    response = model.generate_content("Explain how AI works in a few words")
    print("\n✅ Gemini API connected successfully!")
    print(f"Response: {response.text.strip()}")
except Exception as e:
    print(f"\n❌ Failed: {e}")