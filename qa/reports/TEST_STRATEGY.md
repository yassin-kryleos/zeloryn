# Implementation Plan - UI/UX Remediation Strategy

This plan details the technical steps to resolve the remaining UI/UX, responsiveness, contrast, accessibility, and form usability gaps identified in the visual and behavioral audit of the Kryleos Forge application suite.

---

## Proposed Changes

### Phase 1: Accessibility & Screen Reader Readiness (WCAG Compliance)
* **Goal**: Ensure all interactive controls are identifiable and usable by screen readers.

#### [MODIFY] [Desktop-app/src/components/CoworkSpace.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/CoworkSpace.tsx)
- Append `aria-label` descriptors and `title` tags to all icon-only action buttons (e.g. `Trash2`, `Plus`, `Download`, forward/backward navigation icons).
- Set `role="button"` and `tabIndex={0}` on click-sensitive components.

#### [MODIFY] [Desktop-app/src/components/PlanningScreen.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/PlanningScreen.tsx)
- Add ARIA tags to custom dropdowns, planning panels, and list selections.
- Add `aria-live="polite"` to status messages and task board alerts.

#### [MODIFY] [Web-app/src/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Web-app/src/App.tsx)
- Inject `aria-label` tags into all dashboard navigation icons and control buttons.

#### [MODIFY] [Mobile-app/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/App.tsx)
- Add React Native accessibility props to all `TouchableOpacity` and input controls:
  - `accessibilityLabel`: text description of actions (e.g., "Send chat prompt").
  - `accessibilityRole`: button, textinput, tab, header, etc.
  - `accessibilityState`: for active tab indicators (`{ selected: activeTab === tab }`) and disabled button states.

---

### Phase 2: Mobile Keyboard Behavior & Form Usability
* **Goal**: Prevent the virtual keyboard from covering inputs and enable multi-line prompt submissions.

#### [MODIFY] [Mobile-app/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/App.tsx)
- Wrap the main tab screen views (planning room, workspace chat, settings configuration) in a `KeyboardAvoidingView` component:
  ```typescript
  <KeyboardAvoidingView 
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
    style={{ flex: 1 }}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
  >
    {/* Tab screens */}
  </KeyboardAvoidingView>
  ```
- Re-configure `planInput` and `chatInput` `TextInput` elements:
  - Add `multiline={true}` to support auto-wrapping.
  - Apply dynamic sizing constraints (height min: 48dp, max: 120dp with scroll).
  - Add standard usability flags: `autoCapitalize="sentences"`, `autoCorrect={true}`, `returnKeyType="default"`.
- Set configuration fields input settings:
  - Set `keyboardType="url"` and `autoCorrect={false}` for DESKTOP BACKEND URL.
  - Set `keyboardType="numeric"` and `maxLength={6}` for COMPANION PAIRING CODE.

---

### Phase 3: Ergonomics, Contrast & Touch Target Sizing
* **Goal**: Increase layout scaling and button padding to meet design guidelines (touch targets >= 44px/48px) and increase muted text contrast to WCAG AA compliance (>= 4.5:1).

#### [MODIFY] [Desktop-app/src/index.css](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/index.css)
- Increase contrast ratio for dark mode muted text:
  ```diff
     --accent-hover: #2563eb;
  -  --text-muted: #a1a1aa;
  +  --text-muted: #cbd5e1; /* Compliant 7.2:1 contrast ratio against zinc-950 */
  ```

#### [MODIFY] [Mobile-app/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/App.tsx) (getStyles styles definition)
- Expand button vertical/horizontal paddings to meet minimum touch guidelines:
  - `tabButton`: Increase `paddingVertical` from `10` to `14` (total height ~48dp). Increase text `fontSize` from `9` to `12`.
  - `gridBtn`: Increase `paddingVertical` from `10` to `14`. Increase `fontSize` from `9` to `11`.
  - `syncBtn`: Change padding to `paddingVertical: 8, paddingHorizontal: 12`. Increase font `fontSize` from `8` to `10`.
  - `input` & `inputField`: Increase `height` from `32` to `48` (standard touch targets). Increase `fontSize` from `11` to `14`.
- Increase base typography sizes for readability:
  - `label`: `fontSize: 11` -> `13`
  - `value`: `fontSize: 11` -> `13`
  - `msgContent`: `fontSize: 10` -> `13`
  - `inputLabel`: `fontSize: 8` -> `11`
  - `syncSub`: `fontSize: 8` -> `10`

---

### Phase 4: Web Responsive Layout & Column Wrapping
* **Goal**: Prevent layout overflow and squishing under narrow browser pages or Electron resizing.

#### [MODIFY] [Web-app/src/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Web-app/src/App.tsx)
- Re-configure grid containers with responsive breakpoints:
  - Price tiers grid: change `grid grid-cols-4 gap-4` to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`.
  - Landing pages panels: change `grid grid-cols-3 gap-6` to `grid grid-cols-1 md:grid-cols-3 gap-6`.
  - Response mode selectors: change `grid grid-cols-4 gap-1` to `grid grid-cols-2 sm:grid-cols-4 gap-1.5`.
- Header navigation tabs wrapping: change header `flex items-center justify-between` to support `flex-col md:flex-row gap-3 items-center` for screens under 768px wide.

#### [MODIFY] [Desktop-app/src/components/PlanningScreen.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/PlanningScreen.tsx)
- Replace static split-pane layout with wrap constraints. Adjust column wrappers to use flex wrap or minimum widths:
  - Left chat & Right draft document flex elements: set `min-width: 320px` to trigger clean wrapping when the Electron window is resized.

#### [MODIFY] [Desktop-app/src/components/CoworkSpace.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/CoworkSpace.tsx)
- Restructure the static `w-[380px]` sidebar in CoworkSpace. Add media query triggers or responsive widths so the primary center code Visualizer canvas is not squeezed to zero width in small window bounds.

---

### Phase 5: BackButton Interception & Premium Dialog Toasts
* **Goal**: Handle Android hardware back buttons natively, and replace basic system alert dialogs with visual cyberpunk toasts.

#### [MODIFY] [Mobile-app/App.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Mobile-app/App.tsx)
- Import `BackHandler` from React Native and register a hardware back button listener:
  ```typescript
  useEffect(() => {
    const handleBackButton = () => {
      // Close open modals first
      if (showSyncModal) { setShowSyncModal(false); return true; }
      if (showCollabModal) { setShowCollabModal(false); return true; }
      // If not on dashboard tab, go back to dashboard instead of exiting
      if (activeTab !== 'dashboard') { setActiveTab('dashboard'); return true; }
      return false; // Exit app
    };
    BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => BackHandler.removeEventListener('hardwareBackPress', handleBackButton);
  }, [activeTab, showSyncModal, showCollabModal]);
  ```
- Build a lightweight, custom banner component inside `Mobile-app/App.tsx` (similar to Desktop's `NotificationCenter`) to slide in non-blocking notifications, replacing native blocking `Alert.alert` calls.

---

### Phase 6: Onboarding and Dialog Focus Containment
* **Goal**: Secure onboarding tutorial keyboard accessibility and visual polish.

#### [MODIFY] [Desktop-app/src/components/OnboardingTutorial.tsx](file:///c:/Users/yassi/Documents/Claude/Projects/Matrix-Coding/Desktop-app/src/components/OnboardingTutorial.tsx)
- Implement a basic focus trap using a react hook or ref array: intercept `Tab` key presses and loop focus within the onboarding dialog buttons (Next, Close) while open, preventing tab leakage into background layers.
- Add `role="dialog"` and `aria-modal="true"` to the tutorial card wrapper.

---

## Verification Plan

### Automated Tests
1. **TypeScript Compiles**: Run `npm run build` inside `Web-app` and `Desktop-app` to verify layout typecheck limits.
2. **Mobile Tests**: Run `npm test` in `Mobile-app` to verify compilation.

### Manual Verification
1. **Screen Reader Checks**: Enable voiceover (macOS/iOS) or talkback (Android) / NVDA (Windows) to verify that all icon buttons announce descriptions and active tabs announce state changes.
2. **Keyboard Bounds**: Trigger soft virtual keyboards on iOS and Android devices, focusing on prompts inputs to verify they stay pushed above the keyboard.
3. **Resizing Controls**: Shrink browser widths and Electron window bounds to verify grid wraps and columns stack vertically without text clipping.
4. **Hardware Back Button**: Press the physical back key on an Android emulator to check if modals close or tabs switch back to dashboard rather than closing the app.
5. **Contrast checking**: Verify that dark mode muted text conforms to WCAG AA >= 4.5:1 ratio using color picker analysis.
