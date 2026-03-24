import { decodeKittyPrintable, Editor, Key, matchesKey } from "@mariozechner/pi-tui";

export type ViMode = "insert" | "normal";

const CURSOR_SHAPE_STEADY_BLOCK = "\x1b[2 q";
const CURSOR_SHAPE_STEADY_BAR = "\x1b[6 q";

const RAW_CURSOR_LEFT = "\x1b[D";
const RAW_CURSOR_RIGHT = "\x1b[C";
const RAW_CURSOR_UP = "\x1b[A";
const RAW_CURSOR_DOWN = "\x1b[B";
const RAW_WORD_LEFT = "\x1bb";
const RAW_WORD_RIGHT = "\x1bf";
const RAW_LINE_START = "\x01";
const RAW_LINE_END = "\x05";
const RAW_DELETE_FORWARD = "\x1b[3~";
const RAW_UNDO = "\x1f";
const RAW_SUBMIT = "\r";

function getPrintableKey(data: string): string | null {
  const kittyPrintable = decodeKittyPrintable(data);
  if (kittyPrintable) {
    return kittyPrintable;
  }
  return data.length === 1 ? data : null;
}

export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onAltEnter?: () => void;
  onViModeChange?: (mode: ViMode) => void;

  private viEnabled = false;
  private viMode: ViMode = "insert";

  setViEnabled(enabled: boolean): void {
    this.viEnabled = enabled;
    this.setViMode("insert");
    this.syncCursorShape();
  }

  isViEnabled(): boolean {
    return this.viEnabled;
  }

  getViMode(): ViMode {
    return this.viMode;
  }

  private setViMode(mode: ViMode): void {
    if (this.viMode === mode) {
      return;
    }
    this.viMode = mode;
    this.onViModeChange?.(mode);
    this.syncCursorShape();
  }

  resetCursorShape(): void {
    this.writeTerminal(CURSOR_SHAPE_STEADY_BLOCK);
  }

  private syncCursorShape(): void {
    this.writeTerminal(
      this.viEnabled && this.viMode === "normal"
        ? CURSOR_SHAPE_STEADY_BLOCK
        : CURSOR_SHAPE_STEADY_BAR,
    );
  }

  private writeTerminal(sequence: string): void {
    this.tui?.terminal?.write?.(sequence);
  }

  private delegateToEditor(data: string): void {
    super.handleInput(data);
  }

  private openLineBelow(): void {
    this.delegateToEditor(RAW_LINE_END);
    this.insertTextAtCursor("\n");
  }

  private handleViNormalModeInput(data: string): boolean {
    if (matchesKey(data, Key.enter)) {
      this.delegateToEditor(RAW_SUBMIT);
      return true;
    }

    const printable = getPrintableKey(data);
    if (!printable) {
      return false;
    }

    switch (printable) {
      case "h":
        this.delegateToEditor(RAW_CURSOR_LEFT);
        return true;
      case "j":
        this.delegateToEditor(RAW_CURSOR_DOWN);
        return true;
      case "k":
        this.delegateToEditor(RAW_CURSOR_UP);
        return true;
      case "l":
        this.delegateToEditor(RAW_CURSOR_RIGHT);
        return true;
      case "w":
        this.delegateToEditor(RAW_WORD_RIGHT);
        return true;
      case "b":
        this.delegateToEditor(RAW_WORD_LEFT);
        return true;
      case "0":
        this.delegateToEditor(RAW_LINE_START);
        return true;
      case "$":
        this.delegateToEditor(RAW_LINE_END);
        return true;
      case "x":
        this.delegateToEditor(RAW_DELETE_FORWARD);
        return true;
      case "u":
        this.delegateToEditor(RAW_UNDO);
        return true;
      case "i":
        this.setViMode("insert");
        return true;
      case "a":
        this.delegateToEditor(RAW_CURSOR_RIGHT);
        this.setViMode("insert");
        return true;
      case "o":
        this.openLineBelow();
        this.setViMode("insert");
        return true;
      default:
        return false;
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.alt("enter")) && this.onAltEnter) {
      this.onAltEnter();
      return;
    }
    if (matchesKey(data, Key.ctrl("l")) && this.onCtrlL) {
      this.onCtrlL();
      return;
    }
    if (matchesKey(data, Key.ctrl("o")) && this.onCtrlO) {
      this.onCtrlO();
      return;
    }
    if (matchesKey(data, Key.ctrl("p")) && this.onCtrlP) {
      this.onCtrlP();
      return;
    }
    if (matchesKey(data, Key.ctrl("g")) && this.onCtrlG) {
      this.onCtrlG();
      return;
    }
    if (matchesKey(data, Key.ctrl("t")) && this.onCtrlT) {
      this.onCtrlT();
      return;
    }
    if (matchesKey(data, Key.shift("tab")) && this.onShiftTab) {
      this.onShiftTab();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      if (this.isShowingAutocomplete()) {
        this.delegateToEditor(data);
        return;
      }
      if (this.viEnabled) {
        if (this.viMode === "insert") {
          this.setViMode("normal");
          return;
        }
        if (this.getText().length === 0 && this.onEscape) {
          this.onEscape();
          return;
        }
        return;
      }
      if (this.onEscape) {
        this.onEscape();
        return;
      }
    }
    if (matchesKey(data, Key.ctrl("c")) && this.onCtrlC) {
      this.onCtrlC();
      return;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      if (this.getText().length === 0 && this.onCtrlD) {
        this.onCtrlD();
      }
      return;
    }
    if (this.viEnabled && this.viMode === "normal" && this.handleViNormalModeInput(data)) {
      return;
    }
    super.handleInput(data);
  }
}
