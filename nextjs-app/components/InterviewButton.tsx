"use client";

import { Play } from "lucide-react";

export default function InterviewButton({ candidateId }: { candidateId: string }) {
  const handleStart = async () => {
    alert(`Starting interview for candidate: ${candidateId}`);
    // Tu w przyszłości dodasz: fetch('/api/start-interview')
  };

  return (
    <button
      onClick={handleStart}
      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all"
    >
      <Play size={18} />
      Start Voice Interview
    </button>
  );
}
