import os
import json
import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from dotenv import load_dotenv
from google.genai import types

# 1. Ładowanie konfiguracji
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

if not GOOGLE_API_KEY:
    raise ValueError("BRAK KLUCZA GOOGLE_API_KEY w pliku .env!")

app = FastAPI()

# 2. CORS - Pozwalamy na połączenia z Twojej domeny
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji zmień na ["https://interview.smiletoomee.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Inicjalizacja klienta Gemini
client = genai.Client(
    api_key=GOOGLE_API_KEY,
    http_options={'api_version' : 'v1alpha'}
)

@app.websocket("/api/interview-stream")
async def interview_stream(websocket: WebSocket):
    await websocket.accept()
    print("✅ Frontend połączony")

    # Czysta konfiguracja dla Gemini (bez zbędnych kluczy)
    live_config = {
        "tools": [],
        "system_instruction": "Jesteś rekruterem technicznym. Zawsze na początku przywitaj się krótko i zapytaj kandydata o doświadczenie.",
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {
                "prebuilt_voice_config": {
                    "voice_name": "Aoede" # Dostępne: Aoede, Charon, Fenrir, Kore, Puck
            }
        }
    }
}}

    try:
        # Łączymy się z Gemini Live API
        async with client.aio.live.connect(model=GEMINI_MODEL, config=live_config) as session:
            print(f"Połączono z Gemini ({GEMINI_MODEL})")

            # Przywitanie kandydata na start
#            await session.send(input="START_INTERVIEW", end_of_turn=True)
#            await session.send(
#                input=types.LiveClientRealtimeInput(
#                    content=types.Content(
#                        parts=[types.Part(text="Cześć, zacznij rozmowę rekrutacyjną.")]
#                    )
#                ),
#                end_of_turn=True
#            )
            async def receive_from_frontend():
                """Odbiera dźwięk (PCM 16-bit) i wysyła do Gemini"""
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        # Gemini Live wymaga słownika z 'data' i 'mime_type'
                        await session.send(input=types.LiveClientRealtimeInput(audio=types.Blob(data=data, mime_type="audio/pcm;rate=16000")), end_of_turn=False)
                except WebSocketDisconnect:
                    print("Kandydant rozłączyczł Websocket")
                except Exception as e:
                    print(f"rontend przestał wysyłać audio: {e}")

            async def send_to_frontend():
                """Odbiera audio/tekst od Gemini i wysyła do przeglądarki"""
                try:
                    async for response in session.receive():
#                        server_content = response.server_content
#                        if server_content is not None:
#                            model_turn = server_content.model_turn
#                            if model_turn is not None:
#                                for part in model_turn.parts:
#                                    if part.inline_data and part.inline_data.data:
#                                        await websocket.send_bytes(part.inline_data.data)
                        if response.server_content and response.server_content.model_turn:
                            parts = response.server_content.model_turn.parts
                            for part in parts:
                                if part.inline_data:
                                    audio_bytes = part.inline_data.data
                                    await websocket.send_bytes(audio_bytes)
                                    print("Wysłano chunk audio do frontu")
                        if response.server_content and response.server_content.model_turn:
                            for part in response.server_content.model_turn.parts:
                                if part.text:
                                    print(f"Gemini mówi {part.text}")
                       	# Jeśli Gemini wysyła tekst (transkrypcja)
                                    if part.text:
                                        print(f"AI: {part.text}")
                except Exception as e:
                    print(f"Gemini zakończył nadawanie: {e}")

            # Uruchomienie obu pętli jednocześnie
            await asyncio.gather(receive_from_frontend(), send_to_frontend())

    except WebSocketDisconnect:
        print("Kandydat rozłączył się.")
    except Exception as e:
        print(f"Błąd krytyczny: {e}")
    finally:
        # Na samym końcu odpalamy analizę n8n
        await trigger_n8n_analysis()

async def trigger_n8n_analysis():
    """Wysyła sygnał do n8n po rozmowie"""
    if not N8N_WEBHOOK_URL:
        return

    async with httpx.AsyncClient() as http_client:
        payload = {
            "candidate_id": "123",
            "status": "completed",
            "timestamp": "2026-04-08"
        }
        try:
            await http_client.post(N8N_WEBHOOK_URL, json=payload, timeout=5.0)
            print("ysłano dane do n8n")
        except Exception as e:
            print(f"ie udało się połączyć z n8n: {e}")
