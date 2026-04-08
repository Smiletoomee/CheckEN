'use client';

import { useState, useEffect, useRef } from 'react';

// --- FUNKCJE POMOCNICZE (Wyrzucone poza komponent dla lepszej wydajności) ---

const convertInt16ToFloat32 = (int16Array: Int16Array): Float32Array => {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
};

const convertFloat32ToInt16 = (buffer: Float32Array): Int16Array => {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return buf;
};

// --- GŁÓWNY KOMPONENT ---

export default function CandidateInterview() {
  // Stany aplikacji
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [timeLeft, setTimeLeft] = useState(120);

  // Zunifikowane i czytelne Referencje (Refs)
  const socketRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);

  // --- LOGIKA ROZMOWY ---

  const startInterview = async () => {
    try {
      setStatus('connecting');

      // 1. Dostęp do mikrofonu kandydata
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // 2. Inicjalizacja AudioContext (Jedna instancja, próbkowanie 24kHz dla Gemini)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // 3. Otwarcie połączenia z FastAPI (Warstwa 2)
      const socket = new WebSocket('ws://localhost:8000/api/interview-stream');
      socketRef.current = socket;

      // 4. Obsługa otwarcia połączenia (Wysyłanie dźwięku z mikrofonu)
      socket.onopen = () => {
        setStatus('active');

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
          // Bezpieczne sprawdzenie, czy gniazdo jest w pełni otwarte
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = convertFloat32ToInt16(inputData);
            socketRef.current.send(pcmData);
          }
        };
      };

      // 5. Obsługa wiadomości (Odbieranie i układanie dźwięku z AI)
      socket.onmessage = async (event) => {
        try {
          const ctx = audioContextRef.current;
          if (!ctx) return;

          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          // Konwersja z Int16 do Float32
          const arrayBuffer = await event.data.arrayBuffer();
          const float32Data = convertInt16ToFloat32(new Int16Array(arrayBuffer));

          // Tworzenie bufora do odtworzenia
          const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
          audioBuffer.getChannelData(0).set(float32Data);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);

          // Szeregowanie odtwarzania (chroni przed rwaniem głosu AI)
          const startTime = Math.max(ctx.currentTime, nextPlaybackTimeRef.current);
          source.start(startTime);

          nextPlaybackTimeRef.current = startTime + audioBuffer.duration;

        } catch (err) {
          console.error("Błąd odtwarzania strumienia audio:", err);
        }
      };

      // 6. W przypadku przerwania z drugiej strony
      socket.onclose = () => {
        endInterview();
      };

    } catch (error) {
      console.error("Błąd sprzętu lub sieci:", error);
      alert("Wymagany jest dostęp do mikrofonu, aby rozpocząć proces techniczny.");
      setStatus('idle');
    }
  };

  const endInterview = () => {
    setStatus('completed');

    // Zamknięcie połączenia
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Odcięcie sprzętowe mikrofonu
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // Wyłączenie wewnętrznego miksera przeglądarki
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };

  // --- EFEKTY POBOCZNE (LIFECYCLE) ---

  // Timer odliczający czas rozmowy
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'active' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && status === 'active') {
      endInterview();
    }
    return () => clearInterval(timer);
  }, [status, timeLeft]);

  // Awaryjne sprzątanie przy przejściu na inną podstronę (Unmount)
  useEffect(() => {
    return () => {
      if (status === 'active' || status === 'connecting') {
        endInterview();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- RENDEROWANIE UI ---

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">

      {/* Dekoracje tła */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20"></div>

      <div className="relative z-10 max-w-lg w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">

        {status === 'idle' && (
          <>
            <h1 className="text-3xl font-bold mb-4">Tech Screening</h1>
            <p className="text-slate-400 mb-8">
              Hi candidate! Ready for a quick 2-minute technical chat?
              Ensure your microphone is working and you are in a quiet room.
            </p>
            <button
              onClick={startInterview}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-lg text-lg font-bold transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              Start Interview
            </button>
          </>
        )}

        {status === 'connecting' && (
          <div className="animate-pulse">
            <h2 className="text-2xl font-semibold mb-2">Connecting...</h2>
            <p className="text-slate-400">Establishing secure link to AI engine.</p>
          </div>
        )}

        {status === 'active' && (
          <>
            <div className="mb-8 relative">
              <div className="w-24 h-24 mx-auto bg-blue-500 rounded-full animate-ping opacity-75 absolute left-0 right-0"></div>
              <div className="w-24 h-24 mx-auto bg-blue-600 rounded-full relative z-10 flex items-center justify-center border-4 border-slate-900">
                🎙️
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Interview in progress</h2>
            <p className="text-4xl font-mono text-blue-400">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </p>
            <p className="text-slate-400 mt-4 text-sm">Please answer clearly in English.</p>
          </>
        )}

        {status === 'completed' && (
          <>
            <h2 className="text-3xl font-bold text-green-400 mb-4">Session Completed!</h2>
            <p className="text-slate-300 mb-6">
              Thank you for your time. Your technical profile has been generated and sent to our HR team.
            </p>
            <p className="text-sm text-slate-500 italic">
              You can now safely close this window.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
