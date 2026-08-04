(() => {
    const BRIDGE_VERSION = "2026.08.04.23";
    if (globalThis.__simplyBlocksAIFileBridgeVersion === BRIDGE_VERSION) return;
    globalThis.__simplyBlocksAIFileBridgeVersion = BRIDGE_VERSION;

    const LOG = "[CHAIN]";
    const RESPONSE_TIMEOUT_MS = 180000;
    const UI_TIMEOUT_MS = 30000;

    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const rendered = (element) => Boolean(element && element.isConnected && element.getClientRects().length);
    const visible = (element) => Boolean(rendered(element) && !element.disabled);
    const normalized = (value) => String(value || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
    const comparableText = (value) => normalized(value).replace(/\s+/g, " ");
    const composerContains = (actual, expected) => {
        const comparableActual = comparableText(actual);
        const comparableExpected = comparableText(expected);
        return Boolean(comparableExpected) && (
            comparableActual === comparableExpected ||
            comparableActual.includes(comparableExpected)
        );
    };
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
        composer.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value
        }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function composerAccepted(composer, value, timeout = 1500) {
        const deadline = Date.now() + timeout;
        do {
            if (composerContains(composerValue(composer), value)) return true;
            await sleep(50);
        } while (Date.now() < deadline);
        return false;
    }

    function selectComposerContents(composer) {
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function insertAndVerify(composer, value) {
        composer.focus();
        if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
            const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, "value").set.call(composer, value);
            dispatchComposerEvents(composer, value);
        } else {
            selectComposerContents(composer);
            document.execCommand("delete", false);
            document.execCommand("insertText", false, value);
            if (!await composerAccepted(composer, value, 750)) {
                selectComposerContents(composer);
                const transfer = new DataTransfer();
                transfer.setData("text/plain", value);
                composer.dispatchEvent(new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: transfer
                }));
            }
            if (!await composerAccepted(composer, value, 750)) {
                const lines = String(value).split("\n");
                const paragraphs = lines.map((line) => {
                    const paragraph = document.createElement("p");
                    paragraph.textContent = line;
                    return paragraph;
                });
                composer.replaceChildren(...paragraphs);
                dispatchComposerEvents(composer, value);
            }
        }
        await composerAccepted(composer, value, 1500);
        const actual = composerValue(composer);
        if (!composerContains(actual, value)) {
            throw new Error(`${platform()} did not receive the complete upstream input.`);
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

    function renderedMarkdown(root) {
        const convert = (node, listDepth = 0) => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
            if (!(node instanceof Element) || /^(BUTTON|SVG|STYLE|SCRIPT)$/.test(node.tagName)) return "";
            const children = () => [...node.childNodes].map((child) => convert(child, listDepth)).join("");
            const content = children();
            if (/^H[1-6]$/.test(node.tagName)) return `${"#".repeat(Number(node.tagName[1]))} ${content.trim()}\n\n`;
            if (node.tagName === "P") return `${content.trim()}\n\n`;
            if (node.tagName === "BR") return "\n";
            if (node.tagName === "STRONG" || node.tagName === "B") return `**${content}**`;
            if (node.tagName === "EM" || node.tagName === "I") return `*${content}*`;
            if (node.tagName === "A") return `[${content.trim() || node.href}](${node.href})`;
            if (node.tagName === "PRE") return `\n\`\`\`\n${node.innerText.trim()}\n\`\`\`\n\n`;
            if (node.tagName === "CODE") return `\`${content}\``;
            if (node.tagName === "LI") {
                const ordered = node.parentElement?.tagName === "OL";
                const number = ordered ? `${[...node.parentElement.children].indexOf(node) + 1}.` : "-";
                return `${"  ".repeat(listDepth)}${number} ${content.trim()}\n`;
            }
            if (node.tagName === "UL" || node.tagName === "OL") {
                return `${[...node.children].map((child) => convert(child, listDepth + 1)).join("")}\n`;
            }
            if (node.tagName === "BLOCKQUOTE") return `${content.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
            if (node.tagName === "HR") return "\n---\n\n";
            return content;
        };
        return cleanMarkdown(convert(root).replace(/\n{3,}/g, "\n\n"));
    }

    function responseMarkdownText(response) {
        const selector = platform() === "gemini"
            ? ".markdown, .model-response-text, message-content"
            : ".markdown.prose, [class*='markdown']";
        const content = [...response.querySelectorAll(selector)].filter(visible).at(-1);
        return renderedMarkdown(content || response);
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
                const requiredStableTime = platform() === "gemini" ? 2000 : 1500;
                const completeSignal = !generationIsRunning() && stableFor >= requiredStableTime;
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

    async function findFileInput(composer) {
        const choose = () => {
            const form = composer?.closest("form");
            const scopedInputs = form ? [...form.querySelectorAll("input[type='file']")] : [];
            const inputs = [...scopedInputs, ...document.querySelectorAll("input[type='file']")]
                .filter((input, index, all) => !input.disabled && all.indexOf(input) === index);
            return inputs.find((input) => !input.accept || /text|markdown|document|\.md/i.test(input.accept)) || inputs.at(-1);
        };
        if (choose()) return choose();
        buttonMatching(/attach|upload|add file|add photos|files/i)?.click();
        return waitFor(choose, `${platform()} file input was not found.`, 8000);
    }

    async function attachMarkdown(file, composer) {
        const input = await findFileInput(composer);
        const markdown = new File([file.contents || ""], file.name || "instructions.md", {
            type: "text/markdown",
            lastModified: Date.now()
        });
        const transfer = new DataTransfer();
        transfer.items.add(markdown);
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.files?.[0]?.name !== markdown.name) {
            throw new Error(`${platform()} did not accept the Markdown attachment.`);
        }
        const attachmentVisible = () => {
            const filename = markdown.name.toLowerCase();
            return [...document.querySelectorAll("[data-testid*='attach' i],[data-testid*='file' i],[aria-label],[title]")]
                .some((element) => rendered(element) && `${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.title || ""}`.toLowerCase().includes(filename)) ||
                document.body.innerText.toLowerCase().includes(filename);
        };
        try {
            await waitFor(attachmentVisible, "", 5000);
        } catch {
            const dropTarget = composer.closest("form") || composer;
            ["dragenter", "dragover", "drop"].forEach((type) => {
                dropTarget.dispatchEvent(new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: transfer
                }));
            });
            await waitFor(
                attachmentVisible,
                `${platform()} did not visibly load ${markdown.name}; the flow was stopped before sending.`,
                10000
            );
        }
    }

    async function submitAndCapture(file, inputMode, requestId) {
        console.log(LOG, `Request ${requestId} received by ${platform()}`);
        const baseline = responseSnapshot();
        const composer = await waitFor(findComposer, platform() === "gemini" ? "Gemini input field was not found." : `${platform()} input field was not found.`);
        const executionDirective = [
            "Execute the instructions in the supplied Markdown now.",
            "Do not ask questions or offer options; make reasonable assumptions.",
            "Return only clean, readable Markdown with descriptive headings, short paragraphs, and lists, tables, or fenced code blocks where useful.",
            "Do not use HTML and do not wrap the entire response in a code fence."
        ].join(" ");
        const useInlineMarkdown = platform() === "gemini";
        if (!useInlineMarkdown) await attachMarkdown(file, composer);
        const prompt = useInlineMarkdown
            ? `${executionDirective}\n\n--- BEGIN MARKDOWN FILE: ${file.name || "input.md"} ---\n${file.contents || ""}\n--- END MARKDOWN FILE ---`
            : `${executionDirective} Read the attached Markdown file, preserve its existing Markdown structure, and format every addition so the combined file remains valid and easy to read as a Markdown document.`;
        await insertAndVerify(composer, prompt);
        const send = await waitFor(findSendButton, `${platform()} send button was not found.`);
        send.click();
        await waitFor(
            () => generationIsRunning() || !composerValue(composer) || Boolean(findNewResponse(baseline)),
            `${platform()} submission was not accepted.`
        );
        console.log(LOG, `${platform()} submission completed`);
        const contents = await waitForCompletedResponse(baseline);
        let existingContents = String(file.contents || "");
        const pendingPrompt = String(file.pendingPrompt || "");
        if (pendingPrompt) {
            const promptIndex = existingContents.lastIndexOf(pendingPrompt);
            if (promptIndex >= 0 && !existingContents.slice(promptIndex + pendingPrompt.length).trim()) {
                existingContents = existingContents.slice(0, promptIndex).trimEnd();
            }
        }
        const requestsPromptRetention = /(?:keep|include|retain|preserve)\s+(?:the\s+)?(?:original\s+)?(?:prompt|instructions?)(?:\s+(?:in|as|with|part\s+of)\b)?/i
            .test(existingContents);
        if (!file.hasAIResponse && !requestsPromptRetention) existingContents = "";
        const combinedContents = [existingContents.trim(), contents.trim()].filter(Boolean).join("\n\n");
        const result = {
            ...file,
            type: "text/markdown",
            size: new Blob([combinedContents]).size,
            lastModified: Date.now(),
            contents: combinedContents,
            hasAIResponse: true
        };
        delete result.pendingPrompt;
        return result;
    }

    if (globalThis.__simplyBlocksAIFileBridgeHandler) {
        chrome.runtime.onMessage.removeListener(globalThis.__simplyBlocksAIFileBridgeHandler);
    }
    globalThis.__simplyBlocksAIFileBridgeHandler = (message, _sender, sendResponse) => {
        if (message?.type === "simplyBlocksAIFileBridgeVersion") {
            sendResponse({ version: BRIDGE_VERSION, platform: platform() });
            return false;
        }
        if (message?.type !== "simplyBlocksRunMarkdownAI") return false;
        const requestId = message.requestId || crypto.randomUUID();
        submitAndCapture(message.file, message.inputMode || "attachment", requestId)
            .then((file) => sendResponse({ ok: true, requestId, platform: platform(), file }))
            .catch((error) => {
                console.error(LOG, `Request ${requestId} failed on ${platform()}:`, error);
                sendResponse({ ok: false, requestId, platform: platform(), error: error?.message || "AI processing failed." });
            });
        return true;
    };
    chrome.runtime.onMessage.addListener(globalThis.__simplyBlocksAIFileBridgeHandler);

    console.log(LOG, `AI bridge ready on ${platform()}:`, location.href);
})();
