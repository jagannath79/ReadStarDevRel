'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PauseInfo } from '@/utils/acousticAnalysis';

interface Props {
  audioBlob?: Blob;
  waveformSamples?: number[];
  pauseMap?: PauseInfo[];
  durationMs?: number;
  className?: string;
  height?: number;
}

const PAUSE_COLORS: Record<PauseInfo['type'], string> = {
  micro: 'rgba(156,163,175,0.4)',      // gray
  hesitation: 'rgba(251,191,36,0.5)',   // amber
  extended: 'rgba(249,115,22,0.55)',    // orange
  breakdown: 'rgba(239,68,68,0.6)',     // red
};

const PAUSE_LABELS: Record<PauseInfo['type'], string> = {
  micro: 'micro',
  hesitation: 'hesitation',
  extended: 'extended',
  breakdown: 'breakdown',
};

function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: number[],
  progress: number,          // 0..1 current playhead
  pauseMap: PauseInfo[],
  durationMs: number,
  hoveredPause: PauseInfo | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const mid = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Pause regions
  for (const pause of pauseMap) {
    const x1 = durationMs > 0 ? (pause.startMs / durationMs) * width : 0;
    const x2 = durationMs > 0 ? (pause.endMs / durationMs) * width : 0;
    ctx.fillStyle = PAUSE_COLORS[pause.type];
    ctx.fillRect(x1, 0, Math.max(x2 - x1, 2), height);
    // Border
    if (hoveredPause === pause) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0, Math.max(x2 - x1, 2), height);
    }
  }

  // Waveform bars
  if (samples.length > 0) {
    const barCount = Math.min(samples.length, width);
    const barWidth = width / barCount;
    const playedX = progress * width;

    for (let i = 0; i < barCount; i++) {
      const sampleIdx = Math.floor((i / barCount) * samples.length);
      const amplitude = Math.abs(samples[sampleIdx] ?? 0);
      const barHeight = Math.max(2, amplitude * height * 2.5);
      const x = i * barWidth;
      const isPlayed = x < playedX;

      ctx.fillStyle = isPlayed ? '#1B3A8C' : '#93c5fd';
      ctx.beginPath();
      ctx.roundRect(x, mid - barHeight / 2, Math.max(barWidth - 1, 1), barHeight, 1);
      ctx.fill();
    }
  } else {
    // Flat line placeholder
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
  }

  // Playhead
  if (progress > 0 && progress < 1) {
    const playX = progress * width;
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
    // Triangle knob
    ctx.fillStyle = '#F5A623';
    ctx.beginPath();
    ctx.moveTo(playX - 5, 0);
    ctx.lineTo(playX + 5, 0);
    ctx.lineTo(playX, 8);
    ctx.fill();
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();
}

export default function WaveformPlayer({
  audioBlob,
  waveformSamples = [],
  pauseMap = [],
  durationMs = 0,
  className = '',
  height = 80,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const animFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [hoveredPause, setHoveredPause] = useState<PauseInfo | null>(null);
  const [tooltipPause, setTooltipPause] = useState<{ pause: PauseInfo; x: number } | null>(null);

  const effectiveDuration = durationMs > 0 ? durationMs : (audioRef.current?.duration ?? 0) * 1000;

  // Create audio element from blob
  useEffect(() => {
    if (!audioBlob) return;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(audioBlob);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audio.onended = () => { setIsPlaying(false); setProgress(1); };
    audioRef.current = audio;
    return () => {
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  // RAF-based progress updater
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    const dur = audio.duration || effectiveDuration / 1000;
    if (dur > 0) {
      const p = audio.currentTime / dur;
      setProgress(p);
      setCurrentTimeMs(audio.currentTime * 1000);
    }
    animFrameRef.current = requestAnimationFrame(updateProgress);
  }, [isPlaying, effectiveDuration]);

  useEffect(() => {
    if (isPlaying) animFrameRef.current = requestAnimationFrame(updateProgress);
    else cancelAnimationFrame(animFrameRef.current);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updateProgress]);

  // Redraw canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform(canvas, waveformSamples, progress, pauseMap, effectiveDuration, hoveredPause);
  }, [waveformSamples, progress, pauseMap, effectiveDuration, hoveredPause]);

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio || !audioBlob) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (progress >= 1) {
        audio.currentTime = 0;
        setProgress(0);
      }
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !audioBlob) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
    setCurrentTimeMs(ratio * audio.duration * 1000);
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || pauseMap.length === 0 || effectiveDuration === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const timeMs = ratio * effectiveDuration;
    const hit = pauseMap.find(p => timeMs >= p.startMs && timeMs <= p.endMs) ?? null;
    setHoveredPause(hit);
    setTooltipPause(hit ? { pause: hit, x: e.clientX - rect.left } : null);
  }

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={height}
          className={`w-full rounded-xl border border-gray-200 ${audioBlob ? 'cursor-pointer' : 'cursor-default'}`}
          style={{ height }}
          onClick={audioBlob ? handleCanvasClick : undefined}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => { setHoveredPause(null); setTooltipPause(null); }}
          aria-label="Audio waveform"
        />

        {/* Pause tooltip */}
        {tooltipPause && (
          <div
            className="absolute top-0 z-10 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none shadow-xl"
            style={{ left: Math.min(tooltipPause.x + 8, 520) }}
          >
            <span className="font-semibold capitalize">{PAUSE_LABELS[tooltipPause.pause.type]} pause</span>
            <span className="ml-2 text-gray-400">{tooltipPause.pause.duration}ms</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          disabled={!audioBlob}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1B3A8C] text-white disabled:opacity-40 hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Time display */}
        <span className="text-xs font-mono text-gray-500 tabular-nums">
          {formatTime(currentTimeMs)} / {formatTime(effectiveDuration)}
        </span>

        {/* Pause map legend inline */}
        {pauseMap.length > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {(['hesitation', 'extended', 'breakdown'] as PauseInfo['type'][]).map(type => {
              const count = pauseMap.filter(p => p.type === type).length;
              if (count === 0) return null;
              return (
                <span key={type} className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: PAUSE_COLORS[type].replace('0.5', '0.8').replace('0.55', '0.8').replace('0.6', '0.8') }}
                  />
                  {count}× {type}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {!audioBlob && (
        <p className="text-xs text-gray-400 italic text-center">No audio available</p>
      )}
    </div>
  );
}
