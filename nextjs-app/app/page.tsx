'use client';

import { useState, useEffect, useRef } from 'react';

export default function CandidateInterview() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [timeLeft, setTimeLeft] = useState(120);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Ref do śledzenia czasu następnego fragmentu audio
  const nextStartTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

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
    // Skalowanie z zakresu -1.0...1.0 do -32768...32767
    // Dodajemy małe zabezpieczenie (clipping), żeby dźwięk nie trzeszczał
      const s = Math.max(-1, Math.min(1, buffer[l]));
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf;
  };

  // Funkcja startująca rozmowę
  const startInterview = async () => {
    try {
      setStatus('connecting');
      
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      // 1. Prośba o dostęp do mikrofonu
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;


      // WAŻNE: Sprawdzamy czy na pewno mamy stream przed użyciem AudioContext
      if (!mediaStreamRef.current) return; 

      const audioContext = new AudioContext({ sampleRate: 24000 }); // Zmieniamy na 24kHz dla Gemini!
    
      // TypeScript już nie będzie krzyczał:
      const source = audioContext.createMediaStreamSource(mediaStreamRef.current);

      // 2. Otwarcie WebSocketu do naszego lokalnego serwera Proxy (Warstwa 2)
      // UWAGA: To jest adres do Twojego backendu, nie bezpośrednio do Google!
      wsRef.current = new WebSocket('ws://localhost:8080/api/interview-stream');

      wsRef.current.onopen = async () => {
	setStatus('active');
	const audioContext = new AudioContext({ sampleRate: 16000 });

        if (!mediaStreamRef.current) {
          throw new Error("Brak dostępu do strumienia mikrofonu");
        }

	const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
      // Musisz stworzyć prosty procesor audio (np. Recorder.js lub własny Worklet)
	const processor = audioContext.createScriptProcessor(4096, 1, 1);
  
	source.connect(processor);
	processor.connect(audioContext.destination);

	processor.onaudioprocess = (e) => {
		if (status === 'active') {
			const inputData = e.inputBuffer.getChannelData(0);
			// Konwersja Float32 na Int16 (wymóg większości API głosowych)
			const pcmData = convertFloat32ToInt16(inputData);
			wsRef.current.send(pcmData); 
			}
		};
	};



      wsRef.current.onmessage = async (event) => {
        try {
      // 1. Inicjalizacja AudioContext (jeśli jeszcze nie istnieje)
             if (!audioCtxRef.current) {
             audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
             nextStartTimeRef.current = audioCtxRef.current.currentTime;
            }

            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }

      // 2. Pobranie danych binarnych (ArrayBuffer)
            const arrayBuffer = await event.data.arrayBuffer();
    
      // 3. Konwersja surowych danych Int16 na Float32 (format czytelny dla przeglądarki)
            const float32Data = convertInt16ToFloat32(new Int16Array(arrayBuffer));

      // 4. Stworzenie bufora audio
            const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);

      // 5. Planowanie odtwarzania (Scheduling)
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);

      // Zapobieganie przerwom w dźwięku:
            const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
            source.start(startTime);
    
      // Aktualizacja czasu zakończenia tego fragmentu
            nextStartTimeRef.current = startTime + audioBuffer.duration;

            } catch (err) {
            console.error("Błąd odtwarzania audio:", err);
           }
        };

      wsRef.current.onclose = () => {
        endInterview();
      };

    } catch (error) {
      console.error("Błąd mikrofonu lub połączenia:", error);
      alert("Proszę zezwolić na dostęp do mikrofonu, aby rozpocząć.");
      setStatus('idle');
    }
  };



  // Funkcja kończąca rozmowę
  const endInterview = () => {
    setStatus('completed');
    if (wsRef.current) wsRef.current.close();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };



  // Zegar odliczający 120 sekund
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'active' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && status === 'active') {
      endInterview();
    }
    return () => clearInterval(timer);
  }, [status, timeLeft]);


  // Renderowanie UI zależnie od statusu
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      
      {/* Tło i dekoracje */}
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
              {/* Animacja "mówienia" AI - pulsowanie */}
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
