"use client";
import { useState } from 'react';
import { startInterviewAction } from '@/actions/startInterview';

// Definiujemy kształt danych kandydata
interface Candidate {
  id: string;
  full_name: string;
  applied_position: string;
  phone_number: string;
  // dodaj inne pola jeśli ich używasz w tym komponencie
}

export default function CandidateProfile({ candidate }: { candidate: Candidate}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    
    // Inicjacja procesu "Pierwszego Kliknięcia"
    const result = await startInterviewAction(candidate.id);

    if (result.success) {
      // Tutaj odpalamy SDK do rozmowy głosowej (np. Vapi.start(result.token))
      console.log("Łączenie z asystentem AI z Twoim CV...");
    } else {
      alert("Błąd: " + result.error);
    }
    setIsLoading(false);
  };

  return (
    <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500 transition-all">
      <h3 className="text-xl font-bold text-white">{candidate.full_name}</h3>
      <p className="text-slate-400 mb-4">{candidate.applied_position}</p>
      
      <button 
        onClick={handleStart}
        disabled={isLoading}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
      >
        {isLoading ? "Przygotowuję Eksperta AI..." : "Rozpocznij English Check (2 min)"}
      </button>
    </div>
  );
}
