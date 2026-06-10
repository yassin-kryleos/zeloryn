import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Declare mock state counters with prefix "mock" to satisfy hoisting rules
let mockStateValues: any[] = [];
let mockStateSetters: any[] = [];
let mockStateIndex = 0;
let mockActiveRef = { current: null };

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useRef: (_initialValue: any) => {
      // Return a mocked ref that can be customized in tests
      return mockActiveRef;
    },
    useState: (initialValue: any) => {
      const currentIndex = mockStateIndex;
      if (mockStateValues[currentIndex] === undefined) {
        mockStateValues[currentIndex] = initialValue;
      }
      const setter = (newValue: any) => {
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
    useCallback: (fn: any) => {
      return fn;
    }
  };
});

// Import the hook after the mock has been configured and hoisted
import { useVoiceInput } from './useVoiceInput';

describe('useVoiceInput Hook Business Logic', () => {
  let mockOnTranscript: any;
  let mockStart: any;
  let mockStop: any;
  let mockSpeechRecognition: any;

  beforeEach(() => {
    mockStateValues = [];
    mockStateSetters = [];
    mockStateIndex = 0;
    mockActiveRef = { current: null };

    mockOnTranscript = vi.fn();
    mockStart = vi.fn();
    mockStop = vi.fn();

    mockSpeechRecognition = vi.fn().mockImplementation(function(this: any) {
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

    (globalThis as any).window = {
      SpeechRecognition: mockSpeechRecognition,
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    vi.clearAllMocks();
  });

  it('should detect browser support correctly when SpeechRecognition is present', () => {
    const hook = useVoiceInput(mockOnTranscript);
    expect(hook.isSupported).toBe(true);
    expect(hook.isListening).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('should detect lack of support when window.SpeechRecognition is absent', () => {
    (globalThis as any).window = {};
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
    mockActiveRef.current = recognitionInstance as any;

    const hook = useVoiceInput(mockOnTranscript);
    hook.stopListening();
    expect(mockStop).toHaveBeenCalled();
  });
});
