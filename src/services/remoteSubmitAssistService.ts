import type { Locator, Page } from "playwright";

export interface RemoteSubmitAssistResult {
  editor: string;
  submitButton: string;
}

export async function fillCodeAndClickSubmit(page: Page, code: string): Promise<RemoteSubmitAssistResult> {
  if (!code.trim()) {
    throw new Error("Generated code is empty. Submit was not clicked.");
  }

  const editor = await fillCodeEditor(page, code);
  await assertEditorContainsCode(page, code);
  const submitButton = await clickSubmitButton(page);

  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  return { editor, submitButton };
}

async function fillCodeEditor(page: Page, code: string): Promise<string> {
  const submitRoot = page.locator("#submit-code").first();
  const hasSubmitRoot = (await submitRoot.count()) > 0;
  const scope = hasSubmitRoot ? submitRoot : page.locator("body").first();

  const visibleTextarea = await fillVisibleTextarea(scope, code);
  if (visibleTextarea) {
    await assertEditorContainsCode(page, code);
    return visibleTextarea;
  }

  const codeMirror = await fillCodeMirrorByApi(page, code);
  if (codeMirror) {
    await assertEditorContainsCode(page, code);
    return codeMirror;
  }

  const codeMirrorKeyboard = await fillCodeMirrorByKeyboard(page, scope, code);
  if (codeMirrorKeyboard) {
    await assertEditorContainsCode(page, code);
    return codeMirrorKeyboard;
  }

  const focusedEditor = await fillFocusedEditor(page, scope, code);
  if (focusedEditor) {
    await assertEditorContainsCode(page, code);
    return focusedEditor;
  }

  throw new Error(
    "Could not find a writable code editor. The page may use an unsupported editor or require manual interaction."
  );
}

async function fillVisibleTextarea(scope: Locator, code: string): Promise<string | undefined> {
  const textareas = scope.locator(
    [
      "textarea[name='code']",
      "textarea[name*='code']",
      "textarea[id*='code']",
      "textarea[class*='code']",
      "textarea"
    ].join(", ")
  );
  const count = await textareas.count();

  for (let index = 0; index < count; index += 1) {
    const textarea = textareas.nth(index);
    const usable =
      (await textarea.isVisible({ timeout: 500 }).catch(() => false)) &&
      (await textarea.isEditable({ timeout: 500 }).catch(() => false));
    if (!usable) {
      continue;
    }

    await textarea.fill(code);
    return "visible textarea";
  }

  return undefined;
}

async function fillCodeMirrorByApi(page: Page, code: string): Promise<string | undefined> {
  const result = await page.evaluate((codeText) => {
    type CodeMirrorHost = HTMLElement & {
      CodeMirror?: {
        clearHistory?: () => void;
        focus?: () => void;
        getValue?: () => string;
        save?: () => void;
        refresh?: () => void;
        setValue?: (value: string) => void;
      };
    };
    type VueHost = HTMLElement & {
      __vue__?: unknown;
    };
    type CodeMirrorLike = {
      focus?: () => void;
      save?: () => void;
      refresh?: () => void;
      setValue?: (value: string) => void;
      getValue?: () => string;
    };
    interface FillResult {
      method?: string;
      value: string;
      changed: boolean;
    }

    const isCodeMirrorLike = (value: unknown): value is CodeMirrorLike => {
      if (!value || typeof value !== "object") {
        return false;
      }
      const candidate = value as CodeMirrorLike;
      return typeof candidate.setValue === "function" && typeof candidate.getValue === "function";
    };

    const findCodeMirrorOnVue = (value: unknown, seen = new Set<unknown>(), depth = 0): CodeMirrorLike | undefined => {
      if (!value || typeof value !== "object" || seen.has(value) || depth > 5) {
        return undefined;
      }
      seen.add(value);
      if (isCodeMirrorLike(value)) {
        return value;
      }

      const preferredKeys = [
        "codemirror",
        "codeMirror",
        "cminstance",
        "cmInstance",
        "cm",
        "editor",
        "instance",
        "$refs",
        "$children"
      ];
      const keys = [...preferredKeys, ...Object.keys(value as Record<string, unknown>).slice(0, 60)];
      for (const key of keys) {
        const nested = (value as Record<string, unknown>)[key];
        if (Array.isArray(nested)) {
          for (const item of nested) {
            const found = findCodeMirrorOnVue(item, seen, depth + 1);
            if (found) return found;
          }
          continue;
        }
        const found = findCodeMirrorOnVue(nested, seen, depth + 1);
        if (found) return found;
      }

      return undefined;
    };

    const setCodeMirror = (cm: CodeMirrorLike | undefined): string | undefined => {
      if (!cm?.setValue) {
        return undefined;
      }
      cm.focus?.();
      cm.setValue(codeText);
      cm.save?.();
      cm.refresh?.();
      return cm.getValue?.();
    };

    const setNativeTextArea = (textarea: HTMLTextAreaElement): void => {
      textarea.focus();
      const prototype = Object.getPrototypeOf(textarea) as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(textarea, codeText);
      if (textarea.value !== codeText) {
        textarea.value = codeText;
      }
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: codeText, inputType: "insertText" }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const syncVueModels = (root: ParentNode): number => {
      const vueHosts = Array.from(root.querySelectorAll(".vue-codemirror-wrap, .CodeMirror, textarea, *")) as VueHost[];
      let changed = 0;
      const seen = new Set<unknown>();

      const writeLikelyCodeFields = (value: unknown, depth = 0): void => {
        if (!value || typeof value !== "object" || seen.has(value) || depth > 3) {
          return;
        }
        seen.add(value);
        const record = value as Record<string, unknown>;
        const data = record.$data;

        for (const target of [record, data]) {
          if (!target || typeof target !== "object") {
            continue;
          }
          const targetRecord = target as Record<string, unknown>;
          for (const key of Object.keys(targetRecord)) {
            if (!/(^|_)(code|content|source|value|submission|answer)(_|$)/i.test(key)) {
              continue;
            }
            const current = targetRecord[key];
            if (typeof current === "string" || current === undefined || current === null) {
              targetRecord[key] = codeText;
              changed += 1;
            }
          }
        }

        const emit = record.$emit;
        if (typeof emit === "function") {
          emit.call(record, "input", codeText);
          emit.call(record, "change", codeText);
        }

        const children = record.$children;
        if (Array.isArray(children)) {
          for (const child of children) {
            writeLikelyCodeFields(child, depth + 1);
          }
        }
        const refs = record.$refs;
        if (refs && typeof refs === "object") {
          for (const refValue of Object.values(refs as Record<string, unknown>)) {
            writeLikelyCodeFields(refValue, depth + 1);
          }
        }
      };

      for (const host of vueHosts) {
        writeLikelyCodeFields(host.__vue__);
      }

      return changed;
    };

    const dispatchPasteToCodeMirror = (root: ParentNode): boolean => {
      const textarea = root.querySelector(".CodeMirror textarea") as HTMLTextAreaElement | null;
      if (!textarea) {
        return false;
      }

      textarea.focus();
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", codeText);
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      textarea.dispatchEvent(pasteEvent);
      return pasteEvent.defaultPrevented;
    };

    const roots = [document.querySelector("#submit-code"), document].filter(Boolean) as ParentNode[];
    for (const root of roots) {
      const element = root.querySelector(".CodeMirror") as CodeMirrorHost | null;
      const directValue = setCodeMirror(element?.CodeMirror);
      if (directValue === codeText) {
        syncVueModels(root);
        return { method: "CodeMirror DOM API", value: directValue, changed: true } satisfies FillResult;
      }

      const vueHosts = Array.from(root.querySelectorAll(".vue-codemirror-wrap, .CodeMirror")) as VueHost[];
      for (const host of vueHosts) {
        const cmValue = setCodeMirror(findCodeMirrorOnVue(host.__vue__));
        if (cmValue === codeText) {
          syncVueModels(root);
          return { method: "Vue CodeMirror instance", value: cmValue, changed: true } satisfies FillResult;
        }
      }

      for (const textarea of Array.from(root.querySelectorAll("textarea")) as HTMLTextAreaElement[]) {
        setNativeTextArea(textarea);
      }

      const pasteHandled = dispatchPasteToCodeMirror(root);
      const vueChanges = syncVueModels(root);
      const textareaValue =
        (root.querySelector(".CodeMirror textarea") as HTMLTextAreaElement | null)?.value ??
        (root.querySelector("textarea") as HTMLTextAreaElement | null)?.value ??
        "";
      if (textareaValue.includes(codeText.slice(0, 20)) || pasteHandled || vueChanges > 0) {
        return {
          method: pasteHandled ? "CodeMirror paste event" : "textarea/Vue model sync",
          value: textareaValue,
          changed: true
        } satisfies FillResult;
      }
    }

    return { value: "", changed: false } satisfies FillResult;
  }, code);

  return result.changed ? result.method ?? "CodeMirror API" : undefined;
}

async function fillCodeMirrorByKeyboard(page: Page, scope: Locator, code: string): Promise<string | undefined> {
  const codeMirror = scope.locator(".CodeMirror").first();
  const visible = await codeMirror.isVisible({ timeout: 500 }).catch(() => false);
  if (!visible) {
    return undefined;
  }

  await codeMirror.scrollIntoViewIfNeeded().catch(() => undefined);
  await codeMirror.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(code);

  const filled = await editorContainsCode(page, code);
  return filled ? "CodeMirror keyboard" : undefined;
}

async function fillFocusedEditor(page: Page, scope: Locator, code: string): Promise<string | undefined> {
  const editors = scope.locator(
    [
      ".CodeMirror",
      ".ace_editor",
      ".monaco-editor",
      "[contenteditable='true']",
      "[role='textbox']"
    ].join(", ")
  );
  const count = await editors.count();

  for (let index = 0; index < count; index += 1) {
    const editor = editors.nth(index);
    const visible = await editor.isVisible({ timeout: 500 }).catch(() => false);
    if (!visible) {
      continue;
    }

    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText(code);
    const filled = await editorContainsCode(page, code);
    if (filled) {
      return "focused editor";
    }
  }

  return undefined;
}

async function assertEditorContainsCode(page: Page, code: string): Promise<void> {
  const filled = await page
    .waitForFunction(
      ({ expected, prefix }) => {
        return normalizeForVerification(readEditorCode(expected)).includes(prefix);

        function readEditorCode(fullExpected: string): string {
          const root = document.querySelector("#submit-code") ?? document;
          const codeMirror = root.querySelector(".CodeMirror") as
            | (HTMLElement & {
                CodeMirror?: {
                  getValue?: () => string;
                };
              })
            | null;
          const codeMirrorValue = codeMirror?.CodeMirror?.getValue?.();
          if (codeMirrorValue) {
            return codeMirrorValue;
          }

          const vueCodeMirrorValue = readVueCodeMirrorValue(root);
          if (vueCodeMirrorValue) {
            return vueCodeMirrorValue;
          }

          const textareas = Array.from(root.querySelectorAll("textarea")) as HTMLTextAreaElement[];
          const textareaValue = textareas.map((textarea) => textarea.value).find((value) => value.includes(prefix));
          if (textareaValue) {
            return textareaValue;
          }

          const renderedText = root.querySelector(".CodeMirror-code")?.textContent ?? "";
          if (renderedText.includes(prefix) || renderedText.includes(fullExpected.slice(0, 20))) {
            return renderedText;
          }

          return "";
        }

        function readVueCodeMirrorValue(root: ParentNode): string | undefined {
          type VueHost = HTMLElement & {
            __vue__?: unknown;
          };
          type CodeMirrorLike = {
            getValue?: () => string;
          };
          const seen = new Set<unknown>();

          const visit = (value: unknown, depth = 0): string | undefined => {
            if (!value || typeof value !== "object" || seen.has(value) || depth > 5) {
              return undefined;
            }
            seen.add(value);
            const candidate = value as CodeMirrorLike;
            if (typeof candidate.getValue === "function") {
              const current = candidate.getValue();
              if (current) return current;
            }

            const record = value as Record<string, unknown>;
            const keys = [
              "codemirror",
              "codeMirror",
              "cminstance",
              "cmInstance",
              "cm",
              "editor",
              "instance",
              "$refs",
              "$children"
            ];
            for (const key of keys) {
              const nested = record[key];
              if (Array.isArray(nested)) {
                for (const item of nested) {
                  const found = visit(item, depth + 1);
                  if (found) return found;
                }
              } else {
                const found = visit(nested, depth + 1);
                if (found) return found;
              }
            }
            return undefined;
          };

          const hosts = Array.from(root.querySelectorAll(".vue-codemirror-wrap, .CodeMirror")) as VueHost[];
          for (const host of hosts) {
            const found = visit(host.__vue__);
            if (found) return found;
          }
          return undefined;
        }

        function normalizeForVerification(value: string): string {
          return value.replace(/\s+/g, " ").trim();
        }
      },
      { expected: code, prefix: buildVerificationPrefix(code) },
      { timeout: 5_000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!filled) {
    throw new Error("Code editor was found, but the generated code was not written into it. Submit was not clicked.");
  }
}

async function editorContainsCode(page: Page, code: string): Promise<boolean> {
  const prefix = buildVerificationPrefix(code);
  return page.evaluate(
    ({ expected, prefixText }) => {
      const root = document.querySelector("#submit-code") ?? document;
      const codeMirror = root.querySelector(".CodeMirror") as
        | (HTMLElement & {
            CodeMirror?: {
              getValue?: () => string;
            };
          })
        | null;
      const codeMirrorValue = codeMirror?.CodeMirror?.getValue?.();
      if (normalizeForVerification(codeMirrorValue ?? "").includes(prefixText)) {
        return true;
      }

      const vueCodeMirrorValue = readVueCodeMirrorValue(root);
      if (normalizeForVerification(vueCodeMirrorValue ?? "").includes(prefixText)) {
        return true;
      }

      const textareas = Array.from(root.querySelectorAll("textarea")) as HTMLTextAreaElement[];
      if (textareas.some((textarea) => normalizeForVerification(textarea.value).includes(prefixText))) {
        return true;
      }

      const renderedText = root.querySelector(".CodeMirror-code")?.textContent ?? "";
      return (
        normalizeForVerification(renderedText).includes(prefixText) ||
        normalizeForVerification(renderedText).includes(normalizeForVerification(expected).slice(0, 20))
      );

      function normalizeForVerification(value: string): string {
        return value.replace(/\s+/g, " ").trim();
      }

      function readVueCodeMirrorValue(rootNode: ParentNode): string | undefined {
        type VueHost = HTMLElement & {
          __vue__?: unknown;
        };
        type CodeMirrorLike = {
          getValue?: () => string;
        };
        const seen = new Set<unknown>();

        const visit = (value: unknown, depth = 0): string | undefined => {
          if (!value || typeof value !== "object" || seen.has(value) || depth > 5) {
            return undefined;
          }
          seen.add(value);
          const candidate = value as CodeMirrorLike;
          if (typeof candidate.getValue === "function") {
            const current = candidate.getValue();
            if (current) return current;
          }

          const record = value as Record<string, unknown>;
          for (const key of [
            "codemirror",
            "codeMirror",
            "cminstance",
            "cmInstance",
            "cm",
            "editor",
            "instance",
            "$refs",
            "$children"
          ]) {
            const nested = record[key];
            if (Array.isArray(nested)) {
              for (const item of nested) {
                const found = visit(item, depth + 1);
                if (found) return found;
              }
            } else {
              const found = visit(nested, depth + 1);
              if (found) return found;
            }
          }
          return undefined;
        };

        const hosts = Array.from(rootNode.querySelectorAll(".vue-codemirror-wrap, .CodeMirror")) as VueHost[];
        for (const host of hosts) {
          const found = visit(host.__vue__);
          if (found) return found;
        }
        return undefined;
      }
    },
    { expected: code, prefixText: prefix }
  );
}

function buildVerificationPrefix(code: string): string {
  const normalized = code.replace(/\s+/g, " ").trim();
  return normalized.slice(0, Math.min(40, normalized.length));
}

async function clickSubmitButton(page: Page): Promise<string> {
  const submitRoot = page.locator("#submit-code").first();
  const hasSubmitRoot = (await submitRoot.count()) > 0;
  const scope = hasSubmitRoot ? submitRoot : page.locator("body").first();

  const candidates: Array<{ locator: Locator; description: string }> = [
    { locator: scope.getByRole("button", { name: /^(Submit|提交)$/i }).first(), description: "button role" },
    { locator: scope.locator("button").filter({ hasText: /Submit|提交/i }).first(), description: "button text" },
    { locator: scope.locator('input[type="submit"]').first(), description: "submit input" },
    { locator: scope.locator('button[type="submit"]').first(), description: "submit button" },
    { locator: page.getByRole("button", { name: /^(Submit|提交)$/i }).first(), description: "page button role" }
  ];

  for (const candidate of candidates) {
    const visible = await candidate.locator.isVisible({ timeout: 800 }).catch(() => false);
    if (!visible) {
      continue;
    }

    await candidate.locator.click();
    return candidate.description;
  }

  throw new Error("Could not find a visible Submit button by role, visible text, or submit input.");
}
