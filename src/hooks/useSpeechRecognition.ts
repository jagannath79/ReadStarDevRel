'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { WordTiming } from '@/db/indexeddb';

interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  /** Estimated word timings from recognition event timestamps */
  wordTimings: WordTiming[];
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

// Web Speech API type declarations
declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function useSpeechRecognition(language = 'en-US'): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionStartRef = useRef<number>(0);
  const wordTimingsRef = useRef<WordTiming[]>([]);
  const wordPositionRef = useRef<number>(0);
  // Track time of last finalised result to estimate word boundaries
  const lastResultTimeRef = useRef<number>(0);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
    // Flush timings state
    setWordTimings([...wordTimingsRef.current]);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setWordTimings([]);
    wordTimingsRef.current = [];
    wordPositionRef.current = 0;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      sessionStartRef.current = Date.now();
      lastResultTimeRef.current = Date.now();
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const phrase = result[0].transcript.trim();
          finalText += phrase + ' ';

          // Estimate word timings from event timestamps
          // The Web Speech API doesn't give per-word times, so we distribute
          // the phrase duration evenly across words as a best estimate.
          const phraseWords = phrase.split(/\s+/).filter(Boolean);
          const nowMs = Date.now() - sessionStartRef.current;
          const phraseStartMs = lastResultTimeRef.current - sessionStartRef.current;
          const phraseDurationMs = Math.max(nowMs - phraseStartMs, phraseWords.length * 200);
          const msPerWord = phraseDurationMs / Math.max(phraseWords.length, 1);

          phraseWords.forEach((word, idx) => {
            const wordStartMs = phraseStartMs + idx * msPerWord;
            const timing: WordTiming = {
              word,
              startMs: Math.round(wordStartMs),
              endMs: Math.round(wordStartMs + msPerWord),
              position: wordPositionRef.current,
            };
            wordTimingsRef.current.push(timing);
            wordPositionRef.current++;
          });

          lastResultTimeRef.current = Date.now();
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        setTranscript(prev => (prev + finalText).trim());
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      switch (event.error) {
        case 'not-allowed':
          setError('Microphone access denied. Please allow microphone access and try again.');
          break;
        case 'no-speech':
          break;
        case 'network':
          setError('Network error during speech recognition. Please check your connection.');
          break;
        case 'aborted':
          break;
        default:
          setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      setWordTimings([...wordTimingsRef.current]);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError('Failed to start speech recognition. Please try again.');
      setIsListening(false);
    }
  }, [isSupported, language]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setWordTimings([]);
    wordTimingsRef.current = [];
    wordPositionRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    wordTimings,
    startListening,
    stopListening,
    resetTranscript,
  };
}

// Text-to-Speech helper
export function speakText(text: string, lang = 'en-US'): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.85;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}
