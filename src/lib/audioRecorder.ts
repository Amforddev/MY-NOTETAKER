export interface RecordingResult {
  blob: Blob;
  duration: number; // in seconds
  mimeType: string;
  liveTranscript: string;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  // Speech recognition (live preview)
  private recognition: any = null;
  private liveTranscript: string = '';
  
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private mimeType: string = 'audio/webm';

  public isRecording: boolean = false;
  public isPaused: boolean = false;

  private onTranscriptUpdate?: (text: string) => void;

  constructor(onTranscriptUpdate?: (text: string) => void) {
    this.onTranscriptUpdate = onTranscriptUpdate;
  }

  public async start(): Promise<void> {
    this.audioChunks = [];
    this.liveTranscript = '';
    this.totalPausedDuration = 0;

    // 1. Obtain microphone stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Setup Web Audio Analyser for waveforms
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);
    } catch (e) {
      console.warn('Web Audio API Analyser not supported or failed:', e);
    }

    // 3. Choose best supported MIME type
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    this.mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

    // 4. Initialize MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: this.mimeType,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(200); // 200ms slices
    this.startTime = Date.now();
    this.isRecording = true;
    this.isPaused = false;

    // 5. Try Speech Recognition for real-time live preview
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = navigator.language || 'en-US';

        this.recognition.onresult = (event: any) => {
          let full = '';
          for (let i = 0; i < event.results.length; i++) {
            full += event.results[i][0].transcript + ' ';
          }
          this.liveTranscript = full.trim();
          if (this.onTranscriptUpdate) {
            this.onTranscriptUpdate(this.liveTranscript);
          }
        };

        this.recognition.onerror = (err: any) => {
          // Non-blocking; continue recording audio
          console.debug('Speech recognition hint notice:', err?.error);
        };

        this.recognition.start();
      } catch (err) {
        console.debug('Speech recognition init failed (optional):', err);
      }
    }
  }

  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.pausedTime = Date.now();
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch {
          // ignore
        }
      }
    }
  }

  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      if (this.pausedTime > 0) {
        this.totalPausedDuration += Date.now() - this.pausedTime;
        this.pausedTime = 0;
      }
      if (this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // ignore
        }
      }
    }
  }

  public getElapsedTime(): number {
    if (!this.isRecording) return 0;
    const now = this.isPaused ? this.pausedTime : Date.now();
    return Math.max(0, Math.floor((now - this.startTime - this.totalPausedDuration) / 1000));
  }

  public getWaveformData(): Uint8Array | null {
    if (!this.analyser) return null;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  public async stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder not initialized'));
      }

      const rawDuration = this.getElapsedTime();
      const finalDuration = Math.max(1, rawDuration);

      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch {
          // ignore
        }
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
        this.cleanup();

        resolve({
          blob: audioBlob,
          duration: finalDuration,
          mimeType: this.mimeType,
          liveTranscript: this.liveTranscript,
        });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
        this.cleanup();
        resolve({
          blob: audioBlob,
          duration: finalDuration,
          mimeType: this.mimeType,
          liveTranscript: this.liveTranscript,
        });
      }
    });
  }

  public cancel(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isRecording = false;
    this.isPaused = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    this.sourceNode = null;
    this.analyser = null;
    this.mediaRecorder = null;
  }
}
