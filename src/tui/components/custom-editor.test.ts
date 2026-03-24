import { beforeEach, describe, expect, it, vi } from "vitest";

const baseHandleInput = vi.fn();
const baseInsertTextAtCursor = vi.fn();
const baseGetText = vi.fn(() => "");
const baseIsShowingAutocomplete = vi.fn(() => false);
const terminalWrite = vi.fn();

vi.mock("@mariozechner/pi-tui", () => {
  class MockEditor {
    focused = false;
    protected tui: unknown;

    constructor(tui: unknown) {
      this.tui = tui;
    }

    handleInput(data: string): void {
      baseHandleInput(data);
    }

    insertTextAtCursor(text: string): void {
      baseInsertTextAtCursor(text);
    }

    getText(): string {
      return baseGetText();
    }

    isShowingAutocomplete(): boolean {
      return baseIsShowingAutocomplete();
    }
  }

  const Key = {
    escape: "escape",
    enter: "enter",
    alt: (key: string) => `alt+${key}`,
    ctrl: (key: string) => `ctrl+${key}`,
    shift: (key: string) => `shift+${key}`,
  };

  const tokens = new Map<string, string>([
    ["escape", "<esc>"],
    ["enter", "<enter>"],
    ["alt+enter", "<a-enter>"],
    ["ctrl+c", "<c-c>"],
    ["ctrl+d", "<c-d>"],
    ["ctrl+g", "<c-g>"],
    ["ctrl+l", "<c-l>"],
    ["ctrl+o", "<c-o>"],
    ["ctrl+p", "<c-p>"],
    ["ctrl+t", "<c-t>"],
    ["shift+tab", "<s-tab>"],
  ]);

  return {
    Editor: MockEditor,
    Key,
    matchesKey: (data: string, key: string) => data === tokens.get(key) || data === key,
    decodeKittyPrintable: (data: string) => (data.startsWith("kitty:") ? data.slice(6) : undefined),
  };
});

import { CustomEditor } from "./custom-editor.js";

function createEditor(): CustomEditor {
  return new CustomEditor({ terminal: { write: terminalWrite } } as never, {} as never);
}

describe("CustomEditor vi mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseGetText.mockReturnValue("");
    baseIsShowingAutocomplete.mockReturnValue(false);
  });

  it("uses a bar cursor in insert mode and a block cursor in normal mode", () => {
    const editor = createEditor();

    editor.setViEnabled(true);
    expect(terminalWrite).toHaveBeenLastCalledWith("\x1b[6 q");

    editor.handleInput("<esc>");
    expect(terminalWrite).toHaveBeenLastCalledWith("\x1b[2 q");

    editor.handleInput("i");
    expect(terminalWrite).toHaveBeenLastCalledWith("\x1b[6 q");
  });

  it("restores a block cursor when reset is requested", () => {
    const editor = createEditor();

    editor.setViEnabled(true);
    editor.resetCursorShape();

    expect(terminalWrite).toHaveBeenLastCalledWith("\x1b[2 q");
  });

  it("switches from insert mode to normal mode on escape", () => {
    const editor = createEditor();
    const onViModeChange = vi.fn();
    editor.onViModeChange = onViModeChange;

    editor.setViEnabled(true);
    editor.handleInput("<esc>");

    expect(editor.getViMode()).toBe("normal");
    expect(onViModeChange).toHaveBeenCalledWith("normal");
    expect(baseHandleInput).not.toHaveBeenCalled();
  });

  it("lets escape close autocomplete before switching modes", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    baseIsShowingAutocomplete.mockReturnValue(true);

    editor.handleInput("<esc>");

    expect(editor.getViMode()).toBe("insert");
    expect(baseHandleInput).toHaveBeenCalledWith("<esc>");
  });

  it.each([
    ["h", "\x1b[D"],
    ["j", "\x1b[B"],
    ["k", "\x1b[A"],
    ["l", "\x1b[C"],
    ["w", "\x1bf"],
    ["b", "\x1bb"],
    ["0", "\x01"],
    ["x", "\x1b[3~"],
    ["u", "\x1f"],
  ])("maps %s in normal mode to the editor primitive", (input, expected) => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput(input);

    expect(baseHandleInput).toHaveBeenCalledWith(expected);
    expect(editor.getViMode()).toBe("normal");
  });

  it("accepts kitty printable input for shifted vi commands", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput("kitty:$");

    expect(baseHandleInput).toHaveBeenCalledWith("\x05");
  });

  it("returns to insert mode on i without moving the cursor", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput("i");

    expect(editor.getViMode()).toBe("insert");
    expect(baseHandleInput).not.toHaveBeenCalled();
  });

  it("moves right once and returns to insert mode on a", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput("a");

    expect(baseHandleInput).toHaveBeenCalledWith("\x1b[C");
    expect(editor.getViMode()).toBe("insert");
  });

  it("opens a line below and enters insert mode on o", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput("o");

    expect(baseHandleInput).toHaveBeenCalledWith("\x05");
    expect(baseInsertTextAtCursor).toHaveBeenCalledWith("\n");
    expect(editor.getViMode()).toBe("insert");
  });

  it("submits on enter in normal mode", () => {
    const editor = createEditor();
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseHandleInput.mockClear();

    editor.handleInput("<enter>");

    expect(baseHandleInput).toHaveBeenCalledWith("\r");
  });

  it("keeps ctrl shortcuts active in normal mode", () => {
    const editor = createEditor();
    const onCtrlP = vi.fn();
    editor.onCtrlP = onCtrlP;
    editor.setViEnabled(true);
    editor.handleInput("<esc>");

    editor.handleInput("<c-p>");

    expect(onCtrlP).toHaveBeenCalledTimes(1);
    expect(baseHandleInput).not.toHaveBeenCalledWith("<c-p>");
  });

  it("uses escape to abort only when already in normal mode with empty input", () => {
    const editor = createEditor();
    const onEscape = vi.fn();
    editor.onEscape = onEscape;
    editor.setViEnabled(true);
    editor.handleInput("<esc>");

    editor.handleInput("<esc>");

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("treats escape as a no-op in normal mode when the editor is not empty", () => {
    const editor = createEditor();
    const onEscape = vi.fn();
    editor.onEscape = onEscape;
    editor.setViEnabled(true);
    editor.handleInput("<esc>");
    baseGetText.mockReturnValue("hello");

    editor.handleInput("<esc>");

    expect(onEscape).not.toHaveBeenCalled();
    expect(baseHandleInput).not.toHaveBeenCalledWith("<esc>");
  });
});
