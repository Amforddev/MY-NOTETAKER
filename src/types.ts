export interface VoiceNote {
  id: string;
  title: string;
  transcript: string;
  summary?: string;
  tags?: string[];
  
  // Audio metadata
  duration: number; // in seconds
  audioBlob?: Blob; // stored in client IndexedDB
  audioDataUrl?: string; // base64 or object URL for playback
  mimeType: string;

  // Timestamps
  createdAt: number; // timestamp in ms
  updatedAt: number; // timestamp in ms
  
  // Flags
  isFavorite?: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
}

export interface TranscriptionResult {
  transcript: string;
  title: string;
  summary?: string;
  tags?: string[];
}
