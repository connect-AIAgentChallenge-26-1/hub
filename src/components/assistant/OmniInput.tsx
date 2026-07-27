'use client';

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ['application/pdf'];

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export interface OmniInputPayload {
  text: string;
  file: File | null;
}

interface OmniInputProps {
  onSubmit: (payload: OmniInputPayload) => Promise<void> | void;
  isSubmitting?: boolean;
}

const isAcceptedFile = (file: File) =>
  file.type.startsWith('image/') ||
  ACCEPTED_FILE_TYPES.includes(file.type) ||
  /\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name);

export function OmniInput({
  onSubmit,
  isSubmitting = false,
}: OmniInputProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      }
      recognitionRef.current = null;
    },
    [],
  );

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;

    if (!isAcceptedFile(nextFile)) {
      setError('이미지 또는 PDF 파일만 첨부할 수 있습니다.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setError('첨부 파일은 8MB 이하여야 합니다.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFile(nextFile);
    setError('');
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };

  const toggleSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionApi =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognitionApi();
    const initialText = text.trim();

    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    setIsListening(true);
    setError('');

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      setText([initialText, transcript].filter(Boolean).join(' '));
    };

    recognition.onerror = () => {
      setError('음성을 인식하지 못했습니다. 다시 시도해 주세요.');
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedText = text.trim();

    if (!normalizedText && !file) {
      setError('요청 내용이나 첨부 파일을 입력해 주세요.');
      return;
    }

    setError('');
    try {
      await onSubmit({ text: normalizedText, file });
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : '요청을 처리하지 못했습니다.',
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={`rounded-[1.75rem] border-2 p-3 transition sm:p-4 ${
        isDragging
          ? '-translate-y-1 border-cyan-700 bg-cyan-100 shadow-[7px_7px_0_#0e7490]'
          : 'border-cyan-950 bg-white shadow-[5px_5px_0_#164e63]'
      }`}
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={5}
        placeholder="예: 오늘 2시 회의가 30분 연기됐어. 첨부한 시험범위를 보고 오늘 일정을 재배치해 줘."
        aria-label="AI 비서 요청"
        className="w-full resize-none rounded-2xl border-0 bg-cyan-50/70 px-4 py-4 text-sm font-semibold leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-cyan-100 sm:text-base"
      />

      {file && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-cyan-300 bg-cyan-50 px-3 py-2">
          <span className="text-lg" aria-hidden="true">
            {file.type.startsWith('image/') ? '▧' : '▤'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-cyan-950">
              {file.name}
            </p>
            <p className="font-mono text-xs font-bold text-cyan-700">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            aria-label="첨부 파일 제거"
            className="rounded-lg px-2 py-1 font-black text-slate-500 hover:bg-white hover:text-rose-700"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          onChange={(event) => selectFile(event.target.files?.[0])}
          className="sr-only"
          tabIndex={-1}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border-2 border-cyan-900 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-950 transition hover:-translate-y-0.5 hover:bg-cyan-100"
        >
          <span aria-hidden="true">＋</span> 파일 첨부
        </button>

        <button
          type="button"
          onClick={toggleSpeechRecognition}
          aria-pressed={isListening}
          className={`rounded-xl border-2 px-3 py-2 text-sm font-black transition ${
            isListening
              ? 'animate-pulse border-rose-700 bg-rose-100 text-rose-800'
              : 'border-cyan-900 bg-cyan-50 text-cyan-950 hover:-translate-y-0.5 hover:bg-cyan-100'
          }`}
        >
          <span aria-hidden="true">{isListening ? '●' : '◉'}</span>{' '}
          {isListening ? '듣는 중' : '음성 입력'}
        </button>

        <p className="min-w-0 flex-1 text-xs font-bold text-slate-500">
          이미지·PDF를 끌어놓을 수 있습니다.
        </p>

        <button
          type="submit"
          disabled={isSubmitting}
          className="ml-auto rounded-xl border-2 border-slate-950 bg-slate-950 px-5 py-2.5 text-sm font-black text-cyan-100 shadow-[3px_3px_0_#67e8f9] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? '비서가 처리 중…' : '비서에게 실행 요청'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-bold text-rose-700">
          {error}
        </p>
      )}
    </form>
  );
}
