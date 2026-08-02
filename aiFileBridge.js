(() => {
    const BRIDGE_VERSION = "2026.08.01.9";
    if (globalThis.__simplyBlocksAIFileBridgeVersion === BRIDGE_VERSION) return;
    globalThis.__simplyBlocksAIFileBridgeVersion = BRIDGE_VERSION;

    const LOG = "[CHAIN]";
    const RESPONSE_TIMEOUT_MS = 85000;
    const UI_TIMEOUT_MS = 30000;

    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const rendered = (element) => Boolean(element && element.isConnected && element.getClientRects().length);
    const visible = (element) => Boolean(rendered(element) && !element.disabled);
    const normalized = (value) => String(value || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
    const textOf = (element) => normalized(element?.innerText || element?.textContent);

    function platform() {
        const host = location.hostname.toLowerCase();
        if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") return "chatgpt";
        if (host === "gemini.google.com") return "gemini";
        if (host === "claude.ai") return "claude";
        if (host.includes("notebooklm")) return "notebooklm";
        return "generic";
    }

    async function waitFor(find, errorMessage, timeout = UI_TIMEOUT_MS) {
        const immediate = find();
        if (immediate) return immediate;
        return new Promise((resolve, reject) => {
            const observer = new MutationObserver(() => {
                const result = find();
                if (!result) return;
                cleanup();
                resolve(result);
            });
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(errorMessage));
            }, timeout);
            const cleanup = () => {
                clearTimeout(timer);
                observer.disconnect();
            };
            observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        });
    }

    function allButtons() {
        return [...document.querySelectorAll("button,[role='button']")].filter(visible);
    }

    function buttonMatching(pattern) {
        return allButtons().find((button) => pattern.test(`${button.getAttribute("aria-label") || ""} ${button.title || ""} ${textOf(button)}`));
    }

    function findSendButton() {
        const directSelectors = platform() === "gemini"
            ? ["button[aria-label*='Send message' i]", "button.send-button", "button[mattooltip*='Send' i]"]
            : ["button[data-testid='send-button']", "button[aria-label*='Send message' i]", "button[aria-label='Send' i]"];
        const direct = document.querySelector(directSelectors.join(","));
        if (visible(direct)) return direct;
        return allButtons().filter((button) => /send|submit/i.test(`${button.getAttribute("aria-label") || ""} ${button.title || ""}`)).at(-1);
    }

    function generationIsRunning() {
        const selectors = [
            "button[data-testid='stop-button']",
            "button[aria-label*='Stop generating' i]",
            "button[aria-label*='Stop response' i]",
            "button[aria-label*='Stop' i][mattooltip*='Stop' i]"
        ];
        const stopControlVisible = [...document.querySelectorAll(selectors.join(","))].some(rendered);
        const streamingMarker = document.querySelector(
            "[data-is-streaming='true'],[data-streaming='true'],.result-streaming,.streaming-animation"
        );
        return stopControlVisible || Boolean(streamingMarker && rendered(streamingMarker));
    }

    function findComposer() {
        const selectors = platform() === "gemini"
            ? [
                ".ql-editor[contenteditable='true']",
                "rich-textarea [contenteditable='true']",
                "[contenteditable='true'][role='textbox']",
                "textarea"
            ]
            : [
                "textarea#prompt-textarea",
                "[contenteditable='true'][id='prompt-textarea']",
                "[contenteditable='true'][role='textbox']",
                "div.ProseMirror[contenteditable='true']",
                "textarea"
            ];
        for (const selector of selectors) {
            const candidate = [...document.querySelectorAll(selector)].find(visible);
            if (candidate) return candidate;
        }
        return null;
    }

    function composerValue(composer) {
        return normalized(composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
            ? composer.value
            : composer.innerText || composer.textContent);
    }

    function dispatchComposerEvents(composer, value) {
        composer.dispatchEvent(new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: value
        }));
        composer.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value
        }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function insertAndVerify(composer, value) {
        composer.focus();
        if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
            const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value").set.call(composer, value);
            dispatchComposerEvents(composer, value);
        } else {
            const selection = getSelection();
            const range = document.createRange();
            range.selectNodeContents(composer);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("delete", false);
            const inserted = document.execCommand("insertText", false, value);
            if (!inserted || composerValue(composer) !== normalized(value)) {
                composer.replaceChildren(document.createTextNode(value));
                dispatchComposerEvents(composer, value);
            }
        }
        await Promise.resolve();
        const actual = composerValue(composer);
        if (actual !== normalized(value)) {
            throw new Error(platform() === "gemini"
                ? "Gemini did not receive the ChatGPT output."
                : `${platform()} did not receive the complete input.`);
        }
        return actual;
    }

    function responseElements() {
        const selectorsByPlatform = {
            chatgpt: [
                "[data-message-author-role='assistant']",
                "article[data-turn='assistant']",
                "article[data-testid*='conversation-turn'] [data-message-author-role='assistant']",
                "article[data-testid^='conversation-turn-']",
                "main .markdown.prose"
            ],
            gemini: ["model-response", ".model-response-text", "message-content", "[data-testid*='model-response']"],
            claude: ["[data-testid*='assistant']", ".font-claude-response", "[data-is-streaming]"],
            grok: ["[data-testid*='assistant']", "article"],
            generic: ["[data-message-author-role='assistant']", "[data-testid*='assistant']", ".assistant-message", "model-response"]
        };
        const seen = new Set();
        return [...document.querySelectorAll(selectorsByPlatform[platform()].join(","))]
            .filter((element) => {
                if (!visible(element)) return false;
                if (platform() === "chatgpt" && element.matches("article") && element.querySelector("[data-message-author-role='user']")) {
                    return false;
                }
                const topLevelMatch = ![...element.parentElement?.querySelectorAll?.(selectorsByPlatform[platform()].join(",")) || []]
                    .some((other) => other !== element && other.contains(element));
                const key = textOf(element);
                if (!topLevelMatch || !key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function responseSnapshot() {
        return responseElements().map((element) => ({ element, text: textOf(element) }));
    }

    function findNewResponse(baseline) {
        const baselineElements = new Set(baseline.map((item) => item.element));
        const baselineTexts = new Set(baseline.map((item) => item.text));
        return responseElements().findLast((element) => {
            const text = textOf(element);
            return text && (!baselineElements.has(element) && !baselineTexts.has(text) || baselineElements.has(element) && !baselineTexts.has(text));
        }) || null;
    }

    function cleanMarkdown(value) {
        const trimmed = normalized(value);
        const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
        return normalized(fenced ? fenced[1] : trimmed);
    }

    function responseMarkdownText(response) {
        if (platform() !== "gemini") return textOf(response);
        const content = [...response.querySelectorAll(".markdown, .model-response-text, message-content")]
            .filter(visible)
            .at(-1);
        return textOf(content || response);
    }

    async function linkedMarkdown(response) {
        const links = [...response.querySelectorAll("a[href]")].filter((link) => {
            const value = `${link.getAttribute("href") || ""} ${link.getAttribute("download") || ""} ${textOf(link)}`;
            return /\.md(?:\b|\?)|markdown|download|backend-api\/files|\/files\//i.test(value);
        }).reverse();
        for (const link of links) {
            try {
                const fetched = await fetch(link.href, { credentials: "include" });
                if (!fetched.ok) continue;
                const contents = await fetched.text();
                if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(contents)) continue;
                if (normalized(contents)) return cleanMarkdown(contents);
            } catch (error) {
                console.warn(LOG, "Generated Markdown link could not be read:", error);
            }
        }
        return "";
    }

    async function waitForCompletedResponse(baseline) {
        console.log(LOG, `Waiting for ${platform()} completion`);
        const response = findNewResponse(baseline) || await waitFor(
            () => findNewResponse(baseline),
            `${platform()} has not exposed a response element yet.`,
            5000
        ).catch(() => null);
        return new Promise((resolve, reject) => {
            let lastText = "";
            let stableSince = 0;
            let settled = false;
            let capturing = false;
            let timer;
            const observer = new MutationObserver(check);
            const timeout = setTimeout(() => finish(new Error(`${platform()} did not finish generating.`)), RESPONSE_TIMEOUT_MS);
            async function check() {
                const currentResponse = findNewResponse(baseline) || response;
                if (!currentResponse) return;
                const currentText = responseMarkdownText(currentResponse);
                if (!currentText) return;
                if (currentText !== lastText) {
                    lastText = currentText;
                    stableSince = Date.now();
                }
                const stableFor = Date.now() - stableSince;
                // Measure fallback stability from response text only so unrelated
                // page animations cannot delay the in-memory handoff.
                const completeSignal = (Boolean(findSendButton()) && !generationIsRunning()) || stableFor >= 600;
                if (!completeSignal) {
                    if (!timer) {
                        timer = setTimeout(() => {
                            timer = null;
                            check();
                        }, 25);
                    }
                    return;
                }
                if (capturing) return;
                capturing = true;
                // Copy every AI's rendered response directly. File/link probing adds
                // network latency and is unnecessary for an in-memory block chain.
                const output = cleanMarkdown(currentText);
                if (!output) return finish(new Error(`${platform()} output was empty.`));
                finish(null, output);
            }

            function finish(error, output) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearTimeout(timer);
                observer.disconnect();
                error ? reject(error) : resolve(output);
            }

            observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
            check();
        });
    }

    async function findFileInput() {
        const choose = () => {
            const inputs = [...document.querySelectorAll("input[type='file']")].filter((input) => !input.disabled);
            return inputs.find((input) => !input.accept || /text|markdown|document|\.md/i.test(input.accept)) || inputs.at(-1);
        };
        if (choose()) return choose();
        buttonMatching(/attach|upload|add file|add photos|files/i)?.click();
        return waitFor(choose, `${platform()} file input was not found.`, 8000);
    }

    async function attachMarkdown(file) {
        const input = await findFileInput();
        const markdown = new File([file.contents || ""], file.name || "instructions.md", {
            type: "text/markdown",
            lastModified: Date.now()
        });
        const transfer = new DataTransfer();
        transfer.items.add(markdown);
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(
            () => document.body.innerText.includes(markdown.name),
            `${platform()} did not accept the Markdown attachment.`,
            10000
        );
    }

    async function submitAndCapture(file, inputMode, requestId) {
        console.log(LOG, `Request ${requestId} received by ${platform()}`);
        const baseline = responseSnapshot();
        // All supported composers accept text directly. Keep the handoff entirely
        // in memory instead of uploading a temporary file to each AI service.
        const effectiveInputMode = "inline";
        const composer = await waitFor(findComposer, platform() === "gemini" ? "Gemini input field was not found." : `${platform()} input field was not found.`);
        const prompt = effectiveInputMode === "inline"
            ? file.contents || ""
            : "Follow every instruction in the attached Markdown file. Return only the complete resulting Markdown, without commentary or an outer code fence.";
        await insertAndVerify(composer, prompt);
        if (effectiveInputMode === "inline" && !composerValue(composer).includes(normalized(file.contents))) {
            throw new Error(platform() === "gemini" ? "Gemini did not receive the ChatGPT output." : `${platform()} did not receive the upstream output.`);
        }
        const send = await waitFor(findSendButton, `${platform()} send button was not found.`);
        send.click();
        await waitFor(
            () => generationIsRunning() || !composerValue(composer) || Boolean(findNewResponse(baseline)),
            `${platform()} submission was not accepted.`
        );
        console.log(LOG, `${platform()} submission completed`);
        const contents = await waitForCompletedResponse(baseline);
        return {
            ...file,
            type: "text/markdown",
            size: new Blob([contents]).size,
            lastModified: Date.now(),
            contents
        };
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "simplyBlocksRunMarkdownAI") return false;
        const requestId = message.requestId || crypto.randomUUID();
        submitAndCapture(message.file, message.inputMode || "attachment", requestId)
            .then((file) => sendResponse({ ok: true, requestId, platform: platform(), file }))
            .catch((error) => {
                console.error(LOG, `Request ${requestId} failed on ${platform()}:`, error);
                sendResponse({ ok: false, requestId, platform: platform(), error: error?.message || "AI processing failed." });
            });
        return true;
    });

    console.log(LOG, `AI bridge ready on ${platform()}:`, location.href);
})();
