import os
import json
import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from google import genai

# Konfiguracja
os.environ["GOOGLE_API_KEY"] = "TWOJ_KLUCZ_API"
N8N_WEBHOOK_URL = "http://n8n:5678/webhook/analyze-interview"

app = FastAPI()
client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"], http_options={'api_version': 'v1alpha'})

@app.websocket("/api/interview-stream")
async def interview_stream(websocket: WebSocket):
    await websocket.accept()

    # Konfiguracja sesji Live
    config = {"model": "models/gemini-2.0-flash-exp"}

    # Rozpoczynamy sesję z Gemini
    async with client.aio.live.connect(model=config["model"], config=config) as session:

        # Zadanie 1: Wysyłanie System Promptu (Na start)
        await session.send("Jesteś rekruterem technicznym. Rozpocznij rozmowę od przywitania kandydata.")

        async def receive_from_frontend():
            """Odbiera dźwięk z przeglądarki i wysyła do Gemini"""
            try:
                while True:
                    data = await websocket.receive_bytes()
                    # Wysyłamy surowe bajty audio do Gemini
                    await session.send({"data": data, "mime_type": "audio/pcm;rate=24000"})
            except Exception as e:
                print(f"Frontend connection closed: {e}")

        async def send_to_frontend():
            """Odbiera odpowiedź od Gemini i wysyła do przeglądarki"""
            try:
                async for message in session:
                    if message.audio:
                        # Gemini wysyła paczkę audio -> przesyłamy ją prosto do frontu
                        await websocket.send_bytes(message.audio.data)

                    if message.text:
                        # Opcjonalnie: logujemy tekst do późniejszej analizy n8n
                        print(f"AI: {message.text}")
            except Exception as e:
                print(f"Gemini connection closed: {e}")

        # Uruchamiamy oba zadania naraz (Full Duplex)
        try:
            await asyncio.gather(receive_from_frontend(), send_to_frontend())
        except Exception:
            # Po zakończeniu (np. zamknięcie okna przez kandydata)
            await trigger_n8n_analysis(session)

async def trigger_n8n_analysis(session):
    """Tu dzieje się magia Warstwy 2 po rozmowie"""
    # Wyciągamy historię (jeśli sesja ją zapisała) i wysyłamy do n8n
    async with httpx.AsyncClient() as client_http:
        payload = {
            "candidate_id": "123",
            "summary": "Sesja zakończona, rozpocznij pogłębioną analizę."
        }
        await client_http.post(N8N_WEBHOOK_URL, json=payload)
