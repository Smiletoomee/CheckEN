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
GEMINI_MODEL = os.getenv("GEMINI_MODEL")
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

# Czysta, PŁASKA konfiguracja dla Multimodal Live API



#    live_config = types.LiveConnectConfig(
#        system_instruction=types.Content(
#            parts=[types.Part(text="Jesteś rekruterem. Odpowiadaj na bieżąco.")]
#        ),
#        generation_config=types.GenerationConfig(
#            response_modalities=["AUDIO"],
#            speech_config=types.SpeechConfig(
#                voice_config=types.VoiceConfig(
#                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
#                )
#            )
#        ),
#    # ZMIANA: Używamy dedykowanej klasy dla VAD
#        turn_detection=types.SpeechConfig(
#            voice_config=types.VoiceConfig(
#                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
#            )
#        )
#    )


    live_config = {
        "system_instruction": {
            "parts": [{"text": "Po każdej mojej wypowiedzi odpowiadaj, a następnie pozostań w trybie nasłuchiwania. Nie kończ sesji samodzielnie, a jeżeli po sekundzie nie słyszysz odpowiedzi powiedz coś."}]
        },
        "response_modalities": ["AUDIO"], # <--- To jest na głównym poziomie
        "speech_config": {                # <--- To też na głównym poziomie
            "voice_config": {
                "prebuilt_voice_config": {
                    "voice_name": "Aoede"
                }
            }
        }
    }

    try:
        # Łączymy się z Gemini Live API
        async with client.aio.live.connect(model=GEMINI_MODEL, config=live_config) as session:
            print(f"Połączono z Gemini ({GEMINI_MODEL})")

            async def receive_from_frontend():
                """Odbiera dźwięk (PCM 16-bit) i wysyła do Gemini"""
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        # Gemini Live wymaga słownika z 'data' i 'mime_type'
                        await session.send(input={"data": data, "mime_type": "audio/pcm;rate=24000"}, end_of_turn=True)
                except WebSocketDisconnect:
                    print("Kandydant rozłączyczł Websocket")
                except Exception as e:
                    print(f"rontend przestał wysyłać audio: {e}")

            async def send_to_frontend():
                """Odbiera audio/tekst od Gemini i wysyła do przeglądarki"""
                try:
                    async for response in session.receive():
                        if response.server_content:
                            if response.server_content.model_turn:
                                for part in response.server_content.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
#                                        audio_bytes = part.inline_data.data
                                        await websocket.send_bytes(part.inline_data.data)
#                                    print("Wysłano chunk audio do frontu")
                                    if part.text:
                                        print(f"Gemini mówi {part.text}")

                                if response.server_content.turn_complete:
                                    print(f"Gemini skończyło i słucha")
                       	# Jeśli Gemini wysyła tekst (transkrypcja)
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
