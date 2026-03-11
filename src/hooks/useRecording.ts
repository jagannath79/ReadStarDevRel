'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleWaveform } from '@/utils/acousticAnalysis';

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isSupported: boolean;
  error: string | null;
  volumeLevel: number;
  /** Downsampled waveform (≤ 300 points) for canvas display */
  waveformSamples: number[];
}

interface UseRecordingReturn extends RecordingState {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  /** Always-current blob reference (safe to read in onstop callback) */
  blobRef: { current: Blob | null };
  /**
   * Full-resolution Float32 PCM samples captured during recording.
   * Available after stopRecording() resolves. Use for acoustic analysis.
   */
  getPCMSamples: () => Float32Array;
}

const MAX_DURATION = 60; // seconds
const PCM_SAMPLE_RATE = 44100;
// How often we pull PCM from the analyser (ms)
const PCM_CAPTURE_INTERVAL = 50;

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pcmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const blobRef = useRef<Blob | null>(null);

  // We accumulate raw PCM chunks here
  const pcmBufferRef = useRef<number[]>([]);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined';

  const cleanupAudioUrl = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const stopVolumeAnalysis = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  const stopPCMCapture = useCallback(() => {
    if (pcmIntervalRef.current) {
      clearInterval(pcmIntervalRef.current);
      pcmIntervalRef.current = null;
    }
  }, []);

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Analyser for volume meter (visualizer data)
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Real-time PCM capture: script processor node (or fallback poll)
      const bufferSize = Math.floor((audioCtx.sampleRate * PCM_CAPTURE_INTERVAL) / 1000);
      const scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      source.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);

      scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
        const channelData = e.inputBuffer.getChannelData(0);
        // Push individual samples (no spread of large arrays)
        for (let i = 0; i < channelData.length; i++) {
          pcmBufferRef.current.push(channelData[i]);
        }
        // Throttle buffer growth: keep at most 5 minutes of audio
        const maxSamples = PCM_SAMPLE_RATE * 300;
        if (pcmBufferRef.current.length > maxSamples) {
          pcmBufferRef.current = pcmBufferRef.current.slice(-maxSamples);
        }
      };

      // Volume meter RAF
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(freqData);
        const avg = freqData.reduce((s, v) => s + v, 0) / freqData.length;
        setVolumeLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {
      // Non-critical — skip analysis if AudioContext unavailable
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Audio recording is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      setError(null);
      cleanupAudioUrl();
      setAudioBlob(null);
      setAudioUrl(null);
      setWaveformSamples([]);
      blobRef.current = null;
      chunksRef.current = [];
      pcmBufferRef.current = [];
      durationRef.current = 0;
      setDuration(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        blobRef.current = blob;
        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
        setIsPaused(false);
        stopVolumeAnalysis();
        stopPCMCapture();

        // Compute downsampled waveform for canvas display
        const downsampled = downsampleWaveform(pcmBufferRef.current, 300);
        setWaveformSamples(downsampled);

        // Close AudioContext
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;

        // Stop stream
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      startAudioAnalysis(stream);

      // Duration timer
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= MAX_DURATION) {
          mediaRecorderRef.current?.stop();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 1000);
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        setError('Failed to start recording. Please check your microphone.');
      }
      setIsRecording(false);
    }
  }, [isSupported, cleanupAudioUrl, startAudioAnalysis, stopVolumeAnalysis, stopPCMCapture]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopVolumeAnalysis();
  }, [stopVolumeAnalysis]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= MAX_DURATION) {
          mediaRecorderRef.current?.stop();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 1000);
    }
  }, []);

  const resetRecording = useCallback(() => {
    stopRecording();
    cleanupAudioUrl();
    blobRef.current = null;
    pcmBufferRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setWaveformSamples([]);
    setDuration(0);
    setError(null);
    chunksRef.current = [];
    durationRef.current = 0;
  }, [stopRecording, cleanupAudioUrl]);

  /** Returns full-resolution PCM Float32Array for acoustic analysis */
  const getPCMSamples = useCallback((): Float32Array => {
    return new Float32Array(pcmBufferRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pcmIntervalRef.current) clearInterval(pcmIntervalRef.current);
      stopVolumeAnalysis();
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    isSupported,
    error,
    volumeLevel,
    waveformSamples,
    blobRef,
    getPCMSamples,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  };
}
