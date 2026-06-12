import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type StateSetter = (newValue: unknown) => void;

// Declare mock state counters with prefix "mock" to satisfy hoisting rules
let mockStateValues: unknown[] = [];
let mockStateSetters: StateSetter[] = [];
let mockStateIndex = 0;
let mockActiveRef: { current: unknown } = { current: null };

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useRef: () => {
      // Return a mocked ref that can be customized in tests
      return mockActiveRef;
    },
    useState: (initialValue: unknown) => {
      const currentIndex = mockStateIndex;
      if (mockStateValues[currentIndex] === undefined) {
        mockStateValues[currentIndex] = initialValue;
      }
      const setter: StateSetter = (newValue) => {
        if (typeof newValue === 'function') {
          mockStateValues[currentIndex] = newValue(mockStateValues[currentIndex]);
        } else {
          mockStateValues[currentIndex] = newValue;
        }
      };
      mockStateSetters[currentIndex] = setter;
      mockStateIndex++;
      return [mockStateValues[currentIndex], setter];
    },
    useCallback: <T,>(fn: T) => {
      return fn;
    }
  };
});

// Import the hook after the mock has been configured and hoisted
import { useVoiceInput } from './useVoiceInput';

interface MockRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
}

describe('useVoiceInput Hook Business Logic', () => {
  let mockOnTranscript: ReturnType<typeof vi.fn<(text: string) => void>>;
  let mockStart: ReturnType<typeof vi.fn<() => void>>;
  let mockStop: ReturnType<typeof vi.fn<() => void>>;
  let mockSpeechRecognition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStateValues = [];
    mockStateSetters = [];
    mockStateIndex = 0;
    mockActiveRef = { current: null };

    mockOnTranscript = vi.fn<(text: string) => void>();
    mockStart = vi.fn<() => void>();
    mockStop = vi.fn<() => void>();

    mockSpeechRecognition = vi.fn().mockImplementation(function (this: MockRecognitionInstance) {
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onstart = null;
      this.onerror = null;
      this.onend = null;
      this.onresult = null;
      this.start = mockStart;
      this.stop = mockStop;
    });

    vi.stubGlobal('window', {
      SpeechRecognition: mockSpeechRecognition,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should detect browser support correctly when SpeechRecognition is present', () => {
    const hook = useVoiceInput(mockOnTranscript);
    expect(hook.isSupported).toBe(true);
    expect(hook.isListening).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('should detect lack of support when window.SpeechRecognition is absent', () => {
    vi.stubGlobal('window', {});
    const hook = useVoiceInput(mockOnTranscript);
    expect(hook.isSupported).toBe(false);
  });

  it('should invoke speech recognition start when startListening is called', () => {
    const hook = useVoiceInput(mockOnTranscript);
    hook.startListening();
    expect(mockStart).toHaveBeenCalled();
  });

  it('should trigger stop on the speech recognition instance when stopListening is called', () => {
    const recognitionInstance = {
      start: mockStart,
      stop: mockStop
    };
    // Set the ref value mock active
    mockActiveRef.current = recognitionInstance;

    const hook = useVoiceInput(mockOnTranscript);
    hook.stopListening();
    expect(mockStop).toHaveBeenCalled();
  });
});
