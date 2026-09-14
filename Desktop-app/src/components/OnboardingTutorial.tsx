import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, X, Sparkles } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: "Welcome to Zeloryn",
    description: "Zeloryn runs your project through the Build Loop: VIBE → PLAN → CREW → FLOW → FORGE. You define what you're building, and the app tracks it from idea to executed code. Here's the tour."
  },
  {
    title: "1. PLAN — scope your ideas",
    description: "In the PLAN tab, chat freely in the Scratchbook to think through features. When an idea is ready, hit 'Summarize & Push' to turn the conversation into structured plan items in your workspace."
  },
  {
    title: "2. CREW — specialist review",
    description: "Send plan items to CREW, where specialist personas (Technical Reviewer, Scope Guard, Risk Identifier) refine them and flag risks before anything reaches your board. Install agent packs with one click."
  },
  {
    title: "3. FLOW — your project board",
    description: "Items land on the FLOW Kanban board. The Today panel prioritizes your next 3–5 tasks. Add acceptance criteria, set dependencies, and run 'Check Drift' to see how your code compares to your plan."
  },
  {
    title: "4. FORGE — execute & verify",
    description: "Run a task in FORGE and a specialist agent executes it — every shell command needs your approval. Afterward, an execution trace shows which files changed and which criteria passed. Use Ollama in CONFIG for free local models."
  }
];

interface OnboardingTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus the container dialog on mount for accessibility
    containerRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (!containerRef.current) return;
        const focusableElements = containerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          // Backward tab
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          // Forward tab
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
  };

  const step = tutorialSteps[currentStep];

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding schematic step ${currentStep + 1} of ${tutorialSteps.length}`}
      className="fixed top-[48px] right-4 z-[9999] w-[280px] bg-secondary border border-color rounded-lg p-3 flex flex-col gap-2 shadow-xl outline-none"
    >
      <div className="flex items-center border-b border-color pb-1 justify-between">
        <span className="text-[10px] text-forge-neon font-bold flex items-center gap-1.5">
          <Sparkles size={11} />
          <span>QUICK TOUR {currentStep + 1}/{tutorialSteps.length}</span>
        </span>
        <button
          onClick={handleClose}
          className="text-forge-dim hover:text-forge-text cursor-pointer"
          type="button"
          aria-label="Close tutorial"
        >
          <X size={12} />
        </button>
      </div>
      
      <div className="text-[12px] text-forge-text font-bold">{step.title}</div>
      <p className="text-[10px] text-forge-dim leading-relaxed m-0 mb-2">
        {step.description}
      </p>

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          className="forge-btn flex items-center gap-1 text-[9px] px-2.5 py-1"
          type="button"
          aria-label={currentStep === tutorialSteps.length - 1 ? 'Finish tutorial' : 'Next onboarding step'}
        >
          <span>{currentStep === tutorialSteps.length - 1 ? 'FINISH' : 'NEXT'}</span>
          <ChevronRight size={10} />
        </button>
      </div>
    </div>
  );
};
