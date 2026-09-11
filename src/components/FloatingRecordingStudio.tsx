import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Plus,
  MoreHorizontal,
  Pause,
  Play,
  X,
  Check,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AudioRecorder, RecordingResult } from '../lib/audioRecorder.ts';
import { VoiceNote } from '../types.ts';
import { blobToBase64 } from '../lib/sync.ts';
import { saveLocalNote } from '../lib/db.ts';
import { extractKeywords } from '../lib/tagger.ts';

interface FloatingRecordingStudioProps {
  onNoteCreated: (note: VoiceNote) => void;
  updatingNote?: VoiceNote | null;
  onClearUpdatingNote?: () => void;
  onNoteUpdated?: (note: VoiceNote) => void;
}

export const FloatingRecordingStudio: React.FC<FloatingRecordingStudioProps> = ({
  onNoteCreated,
  updatingNote,
  onClearUpdatingNote,
  onNoteUpdated,
}) => {
  const [recorder, setRecorder] = useState<AudioRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Animate real-time soundwave on canvas during recording
  const startWaveformAnimation = (activeRecorder: AudioRecorder) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const data = activeRecorder.getWaveformData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = 2.5;
      const gap = 2;
      const totalBars = Math.floor(canvas.width / (barWidth + gap));

      if (data && data.length > 0) {
        const step = Math.floor(data.length / totalBars);
        for (let i = 0; i < totalBars; i++) {
          const val = data[i * step] || 0;
          const pct = val / 255;
          const barHeight = Math.max(3, pct * canvas.height * 0.95);
          const x = i * (barWidth + gap);
          const y = (canvas.height - barHeight) / 2;

          ctx.fillStyle = pct > 0.45 ? '#F16544' : '#fca5a5';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
  };

  const stopWaveformAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setIsMenuOpen(false);
    try {
      const newRecorder = new AudioRecorder((transcript) => {
        setLiveTranscript(transcript);
      });

      await newRecorder.start();
      setRecorder(newRecorder);
      setIsRecording(true);
      setIsPaused(false);
      setElapsedTime(0);
      setLiveTranscript('');

      timerIntervalRef.current = window.setInterval(() => {
        setElapsedTime(newRecorder.getElapsedTime());
      }, 500);

      startWaveformAnimation(newRecorder);
    } catch (err: any) {
      console.error('Recording start failed:', err);
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone in your browser.'
          : 'Could not access microphone.'
      );
    }
  };

  const togglePause = () => {
    if (!recorder) return;
    if (isPaused) {
      recorder.resume();
      setIsPaused(false);
    } else {
      recorder.pause();
      setIsPaused(true);
    }
  };

  const cancelRecording = () => {
    if (recorder) recorder.cancel();
    stopWaveformAnimation();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setElapsedTime(0);
    setLiveTranscript('');
    if (onClearUpdatingNote) onClearUpdatingNote();
  };

  // Finish Recording & Transcribe
  const finishAndTranscribe = async () => {
    if (!recorder) return;

    try {
      setIsTranscribing(true);
      stopWaveformAnimation();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      const result: RecordingResult = await recorder.stop();
      const base64Audio = await blobToBase64(result.blob);

      // Call transcription endpoint
      let transcriptionData: any = null;
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            mimeType: result.mimeType,
            clientTranscriptHint: result.liveTranscript || liveTranscript,
          }),
        });

        if (res.ok) {
          transcriptionData = await res.json();
        }
      } catch (err) {
        console.warn('Transcribe request error:', err);
      }

      const finalTranscript =
        transcriptionData?.transcript ||
        result.liveTranscript ||
        liveTranscript ||
        'Spoken audio snippet';

      const now = Date.now();

      // If updating an existing note with voice:
      if (updatingNote && onNoteUpdated) {
        const combinedTranscript = updatingNote.transcript
          ? `${updatingNote.transcript}\n\n${finalTranscript}`
          : finalTranscript;
        const updatedTags = extractKeywords(combinedTranscript, 4);

        const updated: VoiceNote = {
          ...updatingNote,
          transcript: combinedTranscript,
          tags: updatedTags.length > 0 ? updatedTags : updatingNote.tags,
          audioBlob: result.blob,
          audioDataUrl: base64Audio,
          duration: (updatingNote.duration || 0) + result.duration,
          updatedAt: now,
        };
        await saveLocalNote(updated);
        onNoteUpdated(updated);
        if (onClearUpdatingNote) onClearUpdatingNote();
      } else {
        // Create new VoiceNote
        const finalTitle =
          transcriptionData?.title ||
          (finalTranscript.length > 35
            ? finalTranscript.slice(0, 32).trim() + '...'
            : finalTranscript);

        const finalTags =
          transcriptionData?.tags && transcriptionData.tags.length > 0
            ? transcriptionData.tags
            : extractKeywords(finalTranscript, 4);

        const newNote: VoiceNote = {
          id: 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          title: finalTitle,
          transcript: finalTranscript,
          summary: transcriptionData?.summary || finalTranscript.slice(0, 140),
          tags: finalTags,
          duration: result.duration,
          audioBlob: result.blob,
          audioDataUrl: base64Audio,
          mimeType: result.mimeType,
          createdAt: now,
          updatedAt: now,
          isFavorite: false,
          isPinned: false,
        };

        await saveLocalNote(newNote);
        onNoteCreated(newNote);
      }

      setIsRecording(false);
      setIsPaused(false);
      setIsTranscribing(false);
      setElapsedTime(0);
      setLiveTranscript('');
    } catch (err: any) {
      console.error('Finish recording error:', err);
      setErrorMsg('Failed to process recording: ' + err.message);
      setIsTranscribing(false);
    }
  };

  // Upload audio file directly
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) return;
    try {
      setIsTranscribing(true);
      const base64Audio = await blobToBase64(file);
      const now = Date.now();

      let transcriptionData: any = null;
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            mimeType: file.type,
          }),
        });
        if (res.ok) {
          transcriptionData = await res.json();
        }
      } catch (err) {
        console.warn('File transcribe error:', err);
      }

      const finalTranscript = transcriptionData?.transcript || file.name.replace(/\.[^/.]+$/, '');
      const finalTitle = transcriptionData?.title || file.name.replace(/\.[^/.]+$/, '');
      const finalTags =
        transcriptionData?.tags && transcriptionData.tags.length > 0
          ? transcriptionData.tags
          : extractKeywords(finalTranscript, 4);

      const newNote: VoiceNote = {
        id: 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title: finalTitle,
        transcript: finalTranscript,
        summary: transcriptionData?.summary || finalTranscript.slice(0, 140),
        tags: finalTags,
        duration: 10,
        audioBlob: file,
        audioDataUrl: base64Audio,
        mimeType: file.type,
        createdAt: now,
        updatedAt: now,
      };

      await saveLocalNote(newNote);
      onNoteCreated(newNote);
      setIsTranscribing(false);
      setIsMenuOpen(false);
    } catch (e) {
      console.error(e);
      setIsTranscribing(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      id="floating-recording-dock"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
      />

      {/* Voice update target banner */}
      {updatingNote && !isRecording && (
        <div className="mb-2 flex items-center justify-between rounded-full bg-stone-900 text-stone-100 px-4 py-1 text-xs shadow-lg animate-in fade-in">
          <span className="truncate max-w-[260px]">
            Updating: <strong>{updatingNote.title}</strong>
          </span>
          <button
            type="button"
            onClick={onClearUpdatingNote}
            className="ml-2 rounded-full p-0.5 hover:bg-stone-800 text-stone-400 hover:text-white cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Error alert toast */}
      {errorMsg && (
        <div className="mb-2 rounded-full bg-red-600 text-white px-4 py-1.5 text-xs shadow-lg flex items-center gap-2 animate-in fade-in">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ---------------- ACTIVE RECORDING STUDIO (Second Image Animation) ---------------- */}
      {isRecording ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl sm:rounded-full border border-stone-200/90 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md w-[92vw] sm:w-[640px] max-w-2xl transition-all animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between w-full gap-3">
            {/* Left: Pulsing Dot + Timer + Waveform Canvas */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isPaused ? 'bg-amber-500' : 'bg-[#F16544] animate-ping'
                }`}
              />
              <span className="font-mono text-xs font-semibold text-stone-800 tracking-wider">
                {formatTimer(elapsedTime)}
              </span>

              {/* Dynamic Soundwave Canvas */}
              <div className="h-6 w-20 sm:w-28 overflow-hidden rounded">
                <canvas ref={canvasRef} width={112} height={24} className="w-full h-full" />
              </div>
            </div>

            {/* Center: Live Streaming Transcript Typewriter Stream */}
            <div className="flex-1 overflow-hidden px-2 text-left">
              <div className="truncate text-xs text-stone-700 italic">
                {liveTranscript ? (
                  <span>
                    "{liveTranscript}"
                    <span className="inline-block w-1 h-3 ml-0.5 bg-[#F16544] animate-pulse" />
                  </span>
                ) : (
                  <span className="text-stone-400">
                    {updatingNote ? 'Speak your update...' : 'Listening... speak naturally'}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={togglePause}
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play className="h-4 w-4 ml-0.5" /> : <Pause className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={cancelRecording}
                className="rounded-full p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                title="Discard"
              >
                <X className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={finishAndTranscribe}
                disabled={isTranscribing}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F16544] hover:bg-[#e05535] text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                title="Finish and transcribe"
              >
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Finish</span>
              </button>
            </div>
          </div>
        </div>
      ) : isTranscribing ? (
        /* Transcribing Animation Shimmer State */
        <div className="flex items-center gap-3 rounded-full border border-stone-200/90 bg-white/95 px-5 py-2.5 shadow-2xl backdrop-blur-md animate-in fade-in">
          <div className="h-4 w-4 rounded-full border-2 border-[#F16544] border-t-transparent animate-spin" />
          <span className="text-xs font-medium text-stone-800">
            Transcribing audio with Gemini...
          </span>
          <Sparkles className="h-3.5 w-3.5 text-[#F16544] animate-pulse" />
        </div>
      ) : (
        /* ---------------- NORMAL IDLE PILL ---------------- */
        <div className="relative" ref={menuRef}>
          <div className="flex items-center gap-1 rounded-full border border-stone-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-md">
            {/* New Note Coral Pill Button */}
            <button
              id="new-note-button"
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-full bg-[#F16544] hover:bg-[#e05535] text-white px-4 py-2 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>{updatingNote ? 'Record Update' : 'New Note'}</span>
            </button>

            {/* Upload Audio Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition cursor-pointer"
              title="Upload audio file"
            >
              <Upload className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
