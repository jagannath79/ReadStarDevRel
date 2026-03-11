'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  audioBlob?: Blob;
  audioUrl?: string;
  compact?: boolean;
}

export function AudioPlayer({ audioBlob, audioUrl: propUrl, compact = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let url = propUrl;
    if (!url && audioBlob) {
      url = URL.createObjectURL(audioBlob);
      urlRef.current = url;
    }
    if (url) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate = () => setProgress((audio.currentTime / audio.duration) * 100 || 0);
      audio.onended = () => { setIsPlaying(false); setProgress(0); };
    }
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [audioBlob, propUrl]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#1B3A8C] text-white rounded-lg text-sm hover:bg-blue-900 transition-colors"
        aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <Volume2 className="w-4 h-4 opacity-70" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3">
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-[#1B3A8C] text-white flex items-center justify-center hover:bg-blue-900 transition-colors flex-shrink-0"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="w-full bg-blue-200 rounded-full h-2 cursor-pointer" onClick={(e) => {
          if (!audioRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          audioRef.current.currentTime = ratio * duration;
        }}>
          <div
            className="bg-[#1B3A8C] h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime((progress / 100) * duration)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
