import { useCallback, useRef, useState } from 'react';

type SpeechRecognitionResultEvent = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type SpeechRecognitionErrorEvent = {
  error?: string;
};

type LocalSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => LocalSpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<LocalSpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setError(null);
      setIsListening(true);
    };
    recognition.onerror = (event) => {
      setError(event.error || 'Voice recognition failed.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.start();
  }, [isSupported, onTranscript]);

  return { isSupported, isListening, error, startListening, stopListening };
}
