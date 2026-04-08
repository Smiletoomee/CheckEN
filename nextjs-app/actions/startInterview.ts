"use server";

export async function startInterviewAction(candidateId: string) {
  try {
    // 1. Wysyłamy sygnał do Webhooka n8n
    const response = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        candidateId,
        action: 'INITIATE_INTERVIEW',
        timestamp: new Date().toISOString()
      }),
    });

    if (!response.ok) throw new Error("Błąd inicjacji w n8n");

    const sessionData = await response.json();

    // 2. Zwracamy dane sesji (np. Token Vapi lub URL Gemini Live) 
    // n8n w tym czasie już "wszczepiło" prompt z CV do asystenta.
    return {
      success: true,
      callId: sessionData.callId, // Unikalne ID rozmowy
      token: sessionData.webToken  // Token do połączenia WebRTC
    };

  } catch (error) {
    console.error("Critical Interview Error:", error);
    return { success: false, error: "Nie udało się przygotować rozmowy." };
  }
}
