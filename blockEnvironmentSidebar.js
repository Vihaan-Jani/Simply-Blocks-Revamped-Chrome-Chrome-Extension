import { getGoogleToken } from "./auth.js";

function createSidebarButton(title, description, icon, className) {
    const button = document.createElement("button");
    const iconElement = document.createElement("span");
    const text = document.createElement("span");
    const titleElement = document.createElement("span");
    const descriptionElement = document.createElement("span");

    button.className = `block-sidebar-card ${className}`;
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    iconElement.className = "block-sidebar-icon";
    iconElement.textContent = icon;
    text.className = "block-sidebar-text";
    titleElement.className = "block-sidebar-title";
    titleElement.textContent = title;
    descriptionElement.className = "block-sidebar-description";
    descriptionElement.textContent = description;
    text.append(titleElement, descriptionElement);
    button.append(iconElement, text);

    return button;
}

function addBlockSidebarButtons() {
    if (
        document.querySelector(".block-sidebar-card") ||
        !document.querySelector(".workspace-profile-card")
    ) {
        return;
    }

    const newTabButton = createSidebarButton(
        "New Tab",
        "Opens a Brand new Tab (or use Cntrl + T).",
        "+",
        "block-sidebar-new-tab"
    );
    const fullscreenButton = createSidebarButton(
        "Toggle Full-Screen",
        "Enable or Disable Full-Screen Viewing",
        "⛶",
        "block-sidebar-fullscreen"
    );
    const sidePanelButton = createSidebarButton(
        "Toggle Side Panel",
        "Show or hide the side panel",
        "▣",
        "block-sidebar-side-panel"
    );
    const blocksButton = createSidebarButton(
        "Blocks",
        "Manage Your Blocks",
        "▦",
        "block-sidebar-blocks"
    );
    const fileBlockButton = createSidebarButton(
        "File-Block",
        "Create a Save, Export, or Import block",
        "F",
        "block-sidebar-file-block"
    );
    const flowButton = createSidebarButton(
        "Start File Flow",
        "Run Markdown through the connected chain",
        "▶",
        "block-sidebar-flow"
    );
    const makeBlockOverlay = document.getElementById("makeBlockOverlay");
    const closeMakeBlock = document.getElementById("closeMakeBlock");
    const fileBlockOverlay = document.getElementById("fileBlockOverlay");
    const closeFileBlock = document.getElementById("closeFileBlock");
    const createFileBlock = document.getElementById("createFileBlock");
    const fileBlockColor = document.getElementById("fileBlockColor");
    const fileBlockStatus = document.getElementById("fileBlockStatus");
    const fileBlockPicker = document.getElementById("fileBlockPicker");
    const fileBlockPromptField = document.getElementById("fileBlockPromptField");
    const fileBlockPrompt = document.getElementById("fileBlockPrompt");
    const pickImportFile = document.getElementById("pickImportFile");
    const pickedImportFile = document.getElementById("pickedImportFile");
    const importFileInput = document.getElementById("importFileInput");
    const fileBlockTypes = [...document.querySelectorAll(".file-block-type")];
    const flowSaveOverlay = document.getElementById("flowSaveOverlay");
    const flowSaveTitle = document.getElementById("flowSaveTitle");
    const flowSaveDescription = document.getElementById("flowSaveDescription");
    const flowSaveName = document.getElementById("flowSaveName");
    const flowSaveDrive = document.getElementById("flowSaveDrive");
    const flowSaveDownload = document.getElementById("flowSaveDownload");
    const flowSaveEditor = document.getElementById("flowSaveEditor");
    const flowSaveSkip = document.getElementById("flowSaveSkip");
    const flowSaveStatus = document.getElementById("flowSaveStatus");
    const editBlockOverlay = document.getElementById("editBlockOverlay");
    const closeEditBlock = document.getElementById("closeEditBlock");
    const editBlockForm = document.getElementById("editBlockForm");
    const editBlockNameField = document.getElementById("editBlockNameField");
    const editBlockName = document.getElementById("editBlockName");
    const editBlockUrlField = document.getElementById("editBlockUrlField");
    const editBlockUrl = document.getElementById("editBlockUrl");
    const editBlockTypeField = document.getElementById("editBlockTypeField");
    const editBlockType = document.getElementById("editBlockType");
    const editBlockPromptField = document.getElementById("editBlockPromptField");
    const editBlockPrompt = document.getElementById("editBlockPrompt");
    const editBlockColor = document.getElementById("editBlockColor");
    const editBlockStatus = document.getElementById("editBlockStatus");
    const deleteEditedBlock = document.getElementById("deleteEditedBlock");
    let selectedFileBlockName = "Save";
    let editingBlockId = null;
    let selectedImportFile = null;
    const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

    const deleteBlockById = async (blockId) => {
        if (workflowState === "paused") {
            workflowState = "cancelled";
            updateFlowButton();
        } else if (workflowState !== "idle") {
            throw new Error("Finish the active file flow before deleting blocks.");
        }
        const latest = await chrome.storage.local.get("simplyBlocks");
        const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
        const remaining = blocks.filter((item) => item.id !== blockId);
        remaining.forEach((item) => {
            if (item.connectedToBlockId === blockId) {
                delete item.connectedToBlockId;
                delete item.connectorPosition;
                item.connectorDetached = false;
            }
        });
        await chrome.storage.local.set({ simplyBlocks: remaining });
    };

    const closeEditBlockPopup = () => {
        editBlockOverlay.hidden = true;
        editingBlockId = null;
    };

    const openEditBlockPopup = (block) => {
        const isFileBlock = block.type === "file";
        editingBlockId = block.id;
        editBlockNameField.hidden = isFileBlock;
        editBlockUrlField.hidden = isFileBlock;
        editBlockTypeField.hidden = !isFileBlock;
        editBlockName.required = !isFileBlock;
        editBlockUrl.required = !isFileBlock;
        editBlockName.value = block.name || "Block";
        editBlockUrl.value = block.url || "";
        editBlockType.value = isFileBlock ? block.name : "Save";
        editBlockPromptField.hidden = !isFileBlock || block.name !== "Export";
        editBlockPrompt.value = block.prompt || "";
        editBlockColor.value = /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#7c3aed";
        editBlockStatus.textContent = "";
        editBlockOverlay.hidden = false;
        (isFileBlock ? editBlockType : editBlockName).focus();
    };

    closeEditBlock.addEventListener("click", closeEditBlockPopup);
    editBlockType.addEventListener("change", () => {
        editBlockPromptField.hidden = editBlockType.value !== "Export";
    });
    editBlockOverlay.addEventListener("click", (event) => {
        if (event.target === editBlockOverlay) closeEditBlockPopup();
    });
    deleteEditedBlock.addEventListener("click", async () => {
        if (!editingBlockId) return;
        if (!window.confirm("Delete this block? This cannot be undone.")) return;
        deleteEditedBlock.disabled = true;
        try {
            await deleteBlockById(editingBlockId);
            closeEditBlockPopup();
        } catch (error) {
            editBlockStatus.textContent = error?.message || "The block could not be deleted.";
        } finally {
            deleteEditedBlock.disabled = false;
        }
    });
    editBlockForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!editingBlockId) return;
        const submit = editBlockForm.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
            const latest = await chrome.storage.local.get("simplyBlocks");
            const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
            const block = blocks.find((item) => item.id === editingBlockId);
            if (!block) throw new Error("This block no longer exists.");
            if (block.type === "file") {
                block.name = editBlockType.value;
                if (block.name === "Export" && editBlockPrompt.value.trim()) {
                    block.prompt = editBlockPrompt.value.trim();
                } else {
                    delete block.prompt;
                }
            } else {
                let url = editBlockUrl.value.trim();
                if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                const parsed = new URL(url);
                if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Enter a valid website URL.");
                block.name = editBlockName.value.trim() || parsed.hostname;
                block.url = parsed.href;
            }
            block.color = editBlockColor.value;
            await chrome.storage.local.set({ simplyBlocks: blocks });
            closeEditBlockPopup();
        } catch (error) {
            editBlockStatus.textContent = error?.message || "The block could not be updated.";
        } finally {
            submit.disabled = false;
        }
    });

    const serializeFile = (file) => new Promise((resolve, reject) => {
        if (!file.name.toLowerCase().endsWith(".md")) {
            reject(new Error("Only Markdown (.md) files can be attached."));
            return;
        }
        if (file.size > MAX_IMPORT_FILE_BYTES) {
            reject(new Error("Choose a Markdown file smaller than 5 MB."));
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve({
            name: file.name,
            type: "text/markdown",
            size: file.size,
            lastModified: file.lastModified,
            contents: reader.result
        }));
        reader.addEventListener("error", () => reject(new Error("The file could not be read.")));
        reader.readAsText(file);
    });

    const updateImportPicker = () => {
        fileBlockPicker.hidden = selectedFileBlockName !== "Import";
        fileBlockPromptField.hidden = selectedFileBlockName !== "Export";
        pickedImportFile.textContent = selectedImportFile?.name || "No Markdown file selected";
    };

    pickImportFile.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", () => {
        selectedImportFile = importFileInput.files?.[0] || null;
        if (selectedImportFile && !selectedImportFile.name.toLowerCase().endsWith(".md")) {
            selectedImportFile = null;
            importFileInput.value = "";
            fileBlockStatus.textContent = "Only Markdown (.md) files can be attached.";
        } else {
            fileBlockStatus.textContent = "";
        }
        updateImportPicker();
    });

    const closeFileBlockPopup = () => {
        fileBlockOverlay.hidden = true;
        fileBlockButton.setAttribute("aria-pressed", "false");
        fileBlockButton.focus();
    };

    fileBlockButton.setAttribute("aria-pressed", "false");
    fileBlockButton.addEventListener("click", () => {
        fileBlockOverlay.hidden = false;
        fileBlockStatus.textContent = "";
        fileBlockButton.setAttribute("aria-pressed", "true");
        fileBlockTypes.find((button) => button.dataset.fileBlockName === selectedFileBlockName)?.focus();
    });
    closeFileBlock.addEventListener("click", closeFileBlockPopup);
    fileBlockOverlay.addEventListener("click", (event) => {
        if (event.target === fileBlockOverlay) closeFileBlockPopup();
    });
    fileBlockTypes.forEach((button) => button.addEventListener("click", () => {
        selectedFileBlockName = button.dataset.fileBlockName;
        fileBlockTypes.forEach((item) => {
            const selected = item === button;
            item.classList.toggle("selected", selected);
            item.setAttribute("aria-checked", String(selected));
        });
        updateImportPicker();
    }));
    createFileBlock.addEventListener("click", async () => {
        createFileBlock.disabled = true;
        try {
            const { simplyBlocks = [] } = await chrome.storage.local.get("simplyBlocks");
            const blocks = Array.isArray(simplyBlocks) ? simplyBlocks : [];
            const block = {
                id: crypto.randomUUID(),
                type: "file",
                name: selectedFileBlockName,
                color: fileBlockColor.value,
                createdAt: Date.now(),
                position: null
            };
            if (selectedFileBlockName === "Import" && selectedImportFile) {
                block.file = await serializeFile(selectedImportFile);
            }
            if (selectedFileBlockName === "Export" && fileBlockPrompt.value.trim()) {
                block.prompt = fileBlockPrompt.value.trim();
            }
            blocks.push(block);
            await chrome.storage.local.set({ simplyBlocks: blocks });
            selectedImportFile = null;
            importFileInput.value = "";
            fileBlockPrompt.value = "";
            updateImportPicker();
            closeFileBlockPopup();
        } catch (error) {
            console.error("File-Block could not be created:", error);
            fileBlockStatus.textContent = error?.message || "The File-Block could not be created.";
        } finally {
            createFileBlock.disabled = false;
        }
    });

    function closeBlocksPopup() {
        makeBlockOverlay.hidden = true;
        blocksButton.setAttribute("aria-pressed", "false");
        blocksButton.focus();
    }

    blocksButton.setAttribute("aria-pressed", "false");
    blocksButton.addEventListener("click", () => {
        makeBlockOverlay.hidden = false;
        blocksButton.setAttribute("aria-pressed", "true");
        closeMakeBlock.focus();
    });
    closeMakeBlock.addEventListener("click", closeBlocksPopup);
    makeBlockOverlay.addEventListener("click", (event) => {
        if (event.target === makeBlockOverlay) closeBlocksPopup();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !makeBlockOverlay.hidden) closeBlocksPopup();
        if (event.key === "Escape" && !fileBlockOverlay.hidden) closeFileBlockPopup();
        if (event.key === "Escape" && !editBlockOverlay.hidden) closeEditBlockPopup();
    });
    window.addEventListener("message", (event) => {
        if (event.source === document.getElementById("makeBlockFrame")?.contentWindow && event.data?.type === "simplyBlocksCloseBlockManager") {
            closeBlocksPopup();
        }
    });

    const comparableUrl = (value) => {
        try {
            const url = new URL(value);
            url.hash = "";
            if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
            return url.href;
        } catch {
            return value;
        }
    };

    const activateBlockUrl = async (url) => {
        const stored = await chrome.storage.local.get("simplyBlocksGroup");
        let group = null;
        if (stored.simplyBlocksGroup != null) {
            try {
                group = await chrome.tabGroups.get(stored.simplyBlocksGroup);
            } catch {
                await chrome.storage.local.remove("simplyBlocksGroup");
            }
        }

        if (group) {
            const groupedTabs = await chrome.tabs.query({ groupId: group.id });
            const matchingTab = groupedTabs.find((tab) => comparableUrl(tab.pendingUrl || tab.url) === comparableUrl(url));
            if (matchingTab?.id != null) {
                await chrome.tabGroups.update(group.id, { collapsed: false });
                await chrome.tabs.update(matchingTab.id, { active: true });
                await chrome.windows.update(matchingTab.windowId, { focused: true });
                return matchingTab;
            }

            const newTab = await chrome.tabs.create({ url, active: false, windowId: group.windowId });
            await chrome.tabs.group({ tabIds: [newTab.id], groupId: group.id });
            await chrome.tabGroups.update(group.id, { collapsed: false });
            await chrome.tabs.update(newTab.id, { active: true });
            await chrome.windows.update(newTab.windowId, { focused: true });
            return newTab;
        }

        const newTab = await chrome.tabs.create({ url, active: false });
        const groupId = await chrome.tabs.group({ tabIds: [newTab.id] });
        await chrome.tabGroups.update(groupId, { title: "Simply Blocks", color: "blue", collapsed: false });
        await chrome.storage.local.set({ simplyBlocksGroup: groupId });
        await chrome.tabs.update(newTab.id, { active: true });
        await chrome.windows.update(newTab.windowId, { focused: true });
        return newTab;
    };

    const waitForTabReady = async (tabId) => {
        const current = await chrome.tabs.get(tabId);
        if (current.status === "complete") return;
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                reject(new Error("The AI tab did not finish loading."));
            }, 30000);
            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    };

    const transformMarkdownWithAI = async (block, file, inputMode = "attachment", usedTabIds) => {
        const requestId = crypto.randomUUID();
        const host = new URL(block.url).hostname;
        console.log("[CHAIN] Opening or locating AI tab:", host, "request:", requestId);
        const tab = await activateBlockUrl(block.url);
        if (tab?.id == null) throw new Error("The connected AI tab could not be opened.");
        usedTabIds?.add(tab.id);
        await waitForTabReady(tab.id);
        console.log("[CHAIN] Sending input to AI tab:", host, "mode:", inputMode);
        let result;
        try {
            result = await chrome.tabs.sendMessage(tab.id, {
                type: "simplyBlocksRunMarkdownAI",
                file,
                inputMode,
                requestId
            });
        } catch {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["aiFileBridge.js"]
                });
                result = await chrome.tabs.sendMessage(tab.id, {
                    type: "simplyBlocksRunMarkdownAI",
                    file,
                    inputMode,
                    requestId
                });
            } catch (error) {
                throw new Error(error?.message || "The AI page could not receive the Markdown workflow.");
            }
        }
        if (!result?.ok) throw new Error(result?.error || "The AI could not process the Markdown file.");
        if (result.requestId !== requestId) throw new Error("The AI tab returned a mismatched workflow response.");
        if (!result.file?.contents?.trim()) throw new Error(`${result.platform || host} output was empty.`);
        console.log("[CHAIN] AI output captured:", result.platform || host, result.file.contents);
        return result.file;
    };

    const aiPlatformForUrl = (value) => {
        const host = new URL(value).hostname.toLowerCase();
        if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") return "chatgpt";
        if (host === "gemini.google.com") return "gemini";
        if (host === "claude.ai") return "claude";
        if (host.includes("grok")) return "grok";
        return host;
    };

    const markdownFilename = (value, fallback = "simply-blocks.md") => {
        const cleaned = String(value || fallback).trim().replace(/[\\/:*?"<>|]/g, "-");
        return (cleaned || fallback).toLowerCase().endsWith(".md") ? (cleaned || fallback) : `${cleaned || fallback}.md`;
    };

    const exportMarkdownFile = async (file) => {
        const url = URL.createObjectURL(new Blob([file.contents || ""], { type: "text/markdown;charset=utf-8" }));
        try {
            const downloadId = await chrome.downloads.download({
                url,
                filename: markdownFilename(file.name),
                conflictAction: "overwrite",
                saveAs: false
            });
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.downloads.onChanged.removeListener(listener);
                    reject(new Error("The Markdown export timed out."));
                }, 120000);
                const listener = (delta) => {
                    if (delta.id !== downloadId) return;
                    if (delta.error?.current) {
                        clearTimeout(timeout);
                        chrome.downloads.onChanged.removeListener(listener);
                        reject(new Error(`The Markdown export failed: ${delta.error.current}`));
                    } else if (delta.state?.current === "complete") {
                        clearTimeout(timeout);
                        chrome.downloads.onChanged.removeListener(listener);
                        resolve();
                    }
                };
                chrome.downloads.onChanged.addListener(listener);
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const saveMarkdownToDrive = async (file, requestedName) => {
        const name = markdownFilename(requestedName, file.name);
        const token = await getGoogleToken(true);
        const boundary = `simply_blocks_${crypto.randomUUID()}`;
        const metadata = JSON.stringify({ name, mimeType: "text/markdown" });
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
            `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`,
            file.contents || "",
            `\r\n--${boundary}--`
        ], { type: `multipart/related; boundary=${boundary}` });
        const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Google Drive could not save the Markdown file.");
        return result;
    };

    let pendingSaveChoice = null;
    const requestSaveChoice = (file, finalStep = false) => new Promise((resolve) => {
        pendingSaveChoice = { file, resolve };
        flowSaveTitle.textContent = finalStep ? "File flow complete" : "Save File-Block reached";
        flowSaveDescription.textContent = finalStep
            ? "The file reached the end of its chain. Choose where to save it."
            : "Choose where to save the Markdown file, then the flow will continue.";
        flowSaveName.value = markdownFilename(file.name);
        flowSaveStatus.textContent = "";
        flowSaveOverlay.hidden = false;
        flowSaveName.focus();
        flowSaveName.select();
    });

    const finishSaveChoice = (result) => {
        flowSaveOverlay.hidden = true;
        const resolve = pendingSaveChoice?.resolve;
        pendingSaveChoice = null;
        resolve?.(result);
    };
    flowSaveDownload.addEventListener("click", async () => {
        if (!pendingSaveChoice) return;
        flowSaveDownload.disabled = true;
        try {
            await exportMarkdownFile({ ...pendingSaveChoice.file, name: markdownFilename(flowSaveName.value, pendingSaveChoice.file.name) });
            finishSaveChoice({ type: "download" });
        } catch (error) {
            flowSaveStatus.textContent = error?.message || "The Markdown file could not be downloaded.";
        } finally {
            flowSaveDownload.disabled = false;
        }
    });
    flowSaveEditor.addEventListener("click", () => {
        if (!pendingSaveChoice) return;
        const shouldContinue = window.confirm(
            "Opening this Markdown file in the Live Editor will close and discard the file currently open there. Continue?"
        );
        if (!shouldContinue) {
            flowSaveOverlay.hidden = false;
            flowSaveEditor.focus();
            return;
        }
        finishSaveChoice({ type: "editor", file: { ...pendingSaveChoice.file } });
    });
    flowSaveSkip.addEventListener("click", () => finishSaveChoice({ type: "skip" }));
    flowSaveDrive.addEventListener("click", async () => {
        if (!pendingSaveChoice) return;
        flowSaveDrive.disabled = true;
        flowSaveDownload.disabled = true;
        flowSaveEditor.disabled = true;
        flowSaveSkip.disabled = true;
        flowSaveStatus.textContent = "Saving to Google Drive…";
        try {
            const driveFile = await saveMarkdownToDrive(pendingSaveChoice.file, flowSaveName.value);
            finishSaveChoice({ type: "drive", driveFile });
        } catch (error) {
            flowSaveStatus.textContent = error?.message || "Google Drive save failed.";
        } finally {
            flowSaveDrive.disabled = false;
            flowSaveDownload.disabled = false;
            flowSaveEditor.disabled = false;
            flowSaveSkip.disabled = false;
        }
    });

    let workflowState = "idle";
    const flowProcessedBlockIds = new Set();
    const flowProcessedLineIds = new Set();
    const updateFlowButton = () => {
        const title = flowButton.querySelector(".block-sidebar-title");
        const description = flowButton.querySelector(".block-sidebar-description");
        const icon = flowButton.querySelector(".block-sidebar-icon");
        if (workflowState === "running") {
            title.textContent = "Pause File Flow";
            description.textContent = "Pause after the current step";
            icon.textContent = "Ⅱ";
        } else if (workflowState === "paused") {
            title.textContent = "Resume File Flow";
            description.textContent = "Continue through the chain";
            icon.textContent = "▶";
        } else {
            title.textContent = "Start File Flow";
            description.textContent = "Run Markdown through the connected chain";
            icon.textContent = "▶";
        }
        flowButton.setAttribute("aria-pressed", String(workflowState === "paused"));
    };
    const updateFlowVisuals = () => {
        document.querySelectorAll("[data-block-id]").forEach((element) => {
            const processed = flowProcessedBlockIds.has(element.dataset.blockId);
            element.classList.toggle("file-flow-complete", processed);
        });
        document.querySelectorAll("[data-connection-source-id]").forEach((line) => {
            line.classList.toggle("file-flow-complete", flowProcessedLineIds.has(line.dataset.connectionSourceId));
        });
    };
    const waitForFlowStep = async () => {
        while (workflowState === "paused") {
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (workflowState === "cancelled") throw new Error("File flow cancelled because a block was deleted.");
        }
    };

    const focusWorkspaceTab = async (knownTab) => {
        let workspaceTab = knownTab;
        if (workspaceTab?.id == null) {
            const workspaceUrl = chrome.runtime.getURL("blockenvironment.html");
            const matches = await chrome.tabs.query({ url: `${workspaceUrl}*` });
            workspaceTab = matches.sort((first, second) => (second.lastAccessed || 0) - (first.lastAccessed || 0))[0];
        }
        if (workspaceTab?.id == null) return;
        await chrome.windows.update(workspaceTab.windowId, { focused: true });
        await chrome.tabs.update(workspaceTab.id, { active: true });
    };

    const openMarkdownInLiveEditor = async (file) => {
        await chrome.storage.local.set({
            simplyBlocksOpenMarkdownInEditor: {
                id: crypto.randomUUID(),
                requestedAt: Date.now(),
                file
            }
        });
        const editorUrl = chrome.runtime.getURL("editorenvironment.html");
        const tabs = await chrome.tabs.query({});
        const existingEditor = tabs.find((tab) => tab.url === editorUrl);
        if (existingEditor?.id != null) {
            await chrome.windows.update(existingEditor.windowId, { focused: true });
            await chrome.tabs.update(existingEditor.id, { active: true });
        } else {
            await chrome.tabs.create({ url: editorUrl, active: true });
        }
    };

    const runFileWorkflow = async (startBlockId) => {
        if (workflowState !== "idle") return;
        workflowState = "running";
        updateFlowButton();
        let fileRevision = 0;
        let savedRevision = -1;
        let chatGPTOutput = "";
        let previousAIPlatform = "";
        let editorFileToOpen = null;
        const usedBlockTabIds = new Set();
        try {
            const workspaceTab = await chrome.tabs.getCurrent();
            const latest = await chrome.storage.local.get("simplyBlocks");
            const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
            const byId = new Map(blocks.map((block) => [block.id, block]));
            let current = byId.get(startBlockId);
            let file = current?.file;
            if (!current || !file?.name || typeof file.contents !== "string") throw new Error("Add a Markdown file to an Import block first.");
            const originalInput = file.contents;
            console.log("[CHAIN] Original input received:", originalInput);
            const visited = new Set();
            flowProcessedBlockIds.clear();
            flowProcessedLineIds.clear();
            flowProcessedBlockIds.add(current.id);
            updateFlowVisuals();

            while (current?.connectedToBlockId && !visited.has(current.id)) {
                await waitForFlowStep();
                visited.add(current.id);
                const next = byId.get(current.connectedToBlockId);
                if (!next) break;
                if (next.url) {
                    const nextPlatform = aiPlatformForUrl(next.url);
                    if (nextPlatform === "chatgpt") console.log("[CHAIN] Sending input to ChatGPT");
                    if (nextPlatform === "gemini") {
                        console.log("[CHAIN] Opening or locating Gemini");
                        if (previousAIPlatform === "chatgpt") {
                            if (!chatGPTOutput.trim()) throw new Error("ChatGPT output was empty.");
                            file = { ...file, contents: chatGPTOutput, size: new Blob([chatGPTOutput]).size };
                            console.log("[CHAIN] Sending ChatGPT output to Gemini", chatGPTOutput);
                        }
                    }
                    next.lastFileAction = "processing-ai";
                    await chrome.storage.local.set({ simplyBlocks: blocks });
                    try {
                        const transformedFile = await transformMarkdownWithAI(
                            next,
                            file,
                            fileRevision > 0 ? "inline" : "attachment",
                            usedBlockTabIds
                        );
                        if (nextPlatform === "chatgpt") {
                            chatGPTOutput = transformedFile.contents;
                            if (!chatGPTOutput.trim()) throw new Error("ChatGPT output was empty.");
                            console.log("[CHAIN] ChatGPT output captured:", chatGPTOutput);
                        }
                        file = transformedFile;
                        previousAIPlatform = nextPlatform;
                        if (nextPlatform === "gemini") console.log("[CHAIN] Gemini submission completed");
                        fileRevision += 1;
                        next.lastFileAction = "processed-ai";
                        delete next.fileError;
                    } catch (error) {
                        next.lastFileAction = "ai-failed";
                        next.fileError = error?.message || "AI processing failed.";
                        await chrome.storage.local.set({ simplyBlocks: blocks });
                        throw error;
                    }
                    await focusWorkspaceTab(workspaceTab);
                }
                if (next.type === "file" && next.name === "Export" && next.prompt?.trim()) {
                    const contents = `${next.prompt.trim()}\n\n${file.contents || ""}`;
                    file = {
                        ...file,
                        contents,
                        size: new Blob([contents]).size,
                        lastModified: Date.now()
                    };
                }
                next.file = { ...file };
                next.fileReceivedAt = Date.now();
                file = next.file;
                flowProcessedLineIds.add(current.id);
                flowProcessedBlockIds.add(next.id);
                updateFlowVisuals();

                if (next.type === "file" && next.name === "Export") {
                    if (next.connectedToBlockId) {
                        // A connected Export is an in-chain handoff. Keep replacing the
                        // block's in-memory file instead of creating and waiting for a
                        // new browser download at every intermediate step.
                        next.lastFileAction = "updated";
                    } else {
                        await exportMarkdownFile(file);
                        next.lastFileAction = "exported";
                        savedRevision = fileRevision;
                    }
                } else if (next.type === "file" && next.name === "Save") {
                    try {
                        await focusWorkspaceTab(workspaceTab);
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        const choice = await requestSaveChoice(file);
                        if (choice.type !== "skip") savedRevision = fileRevision;
                        if (choice.type === "editor") editorFileToOpen = choice.file;
                        next.lastFileAction = choice.type === "drive"
                            ? "saved"
                            : choice.type === "download"
                                ? "exported"
                                : choice.type === "editor"
                                    ? "opened-editor"
                                    : "save-cancelled";
                        if (choice.driveFile) next.driveFile = choice.driveFile;
                    } catch (error) {
                        next.lastFileAction = "save-failed";
                        next.fileError = error?.message || "Google Drive save failed.";
                        console.error("The File-Block workflow could not save to Drive:", error);
                    }
                }
                current = next;
            }
            await chrome.storage.local.set({ simplyBlocks: blocks });
            await focusWorkspaceTab(workspaceTab);
            if (savedRevision !== fileRevision) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                const choice = await requestSaveChoice(file, true);
                if (choice.type !== "skip") savedRevision = fileRevision;
                if (choice.type === "editor") editorFileToOpen = choice.file;
            }
            if (usedBlockTabIds.size) {
                const shouldCloseBlockTabs = window.confirm(
                    `File flow complete. Close the ${usedBlockTabIds.size} block URL tab${usedBlockTabIds.size === 1 ? "" : "s"} used by this flow?`
                );
                if (shouldCloseBlockTabs) {
                    const existingTabs = await Promise.all(
                        [...usedBlockTabIds].map((tabId) => chrome.tabs.get(tabId).catch(() => null))
                    );
                    const tabIdsToClose = existingTabs.filter(Boolean).map((tab) => tab.id);
                    if (tabIdsToClose.length) await chrome.tabs.remove(tabIdsToClose);
                }
            }
            if (editorFileToOpen) await openMarkdownInLiveEditor(editorFileToOpen);
            await new Promise((resolve) => setTimeout(resolve, 450));
        } catch (error) {
            window.alert(error?.message || "The file flow could not be completed.");
        } finally {
            workflowState = "idle";
            flowProcessedBlockIds.clear();
            flowProcessedLineIds.clear();
            updateFlowVisuals();
            updateFlowButton();
        }
    };

    flowButton.addEventListener("click", async () => {
        if (workflowState === "running") {
            workflowState = "paused";
            updateFlowButton();
            return;
        }
        if (workflowState === "paused") {
            workflowState = "running";
            updateFlowButton();
            return;
        }
        const { simplyBlocks = [] } = await chrome.storage.local.get("simplyBlocks");
        const imports = (Array.isArray(simplyBlocks) ? simplyBlocks : [])
            .filter((block) => block.type === "file" && block.name === "Import" && block.file?.contents)
            .sort((first, second) => (second.fileReceivedAt || second.createdAt || 0) - (first.fileReceivedAt || first.createdAt || 0));
        if (!imports.length) {
            const openEditor = window.confirm("No Markdown file is attached. Open the Live Editor to create one?");
            if (!openEditor) return;
            await chrome.storage.local.set({
                simplyBlocksMarkdownEditorRequest: {
                    id: crypto.randomUUID(),
                    requestedAt: Date.now()
                }
            });
            const editorUrl = chrome.runtime.getURL("editorenvironment.html");
            const tabs = await chrome.tabs.query({});
            const existingEditor = tabs.find((tab) => tab.url === editorUrl);
            if (existingEditor?.id != null) {
                await chrome.windows.update(existingEditor.windowId, { focused: true });
                await chrome.tabs.update(existingEditor.id, { active: true });
            } else {
                await chrome.tabs.create({ url: editorUrl, active: true });
            }
            return;
        }
        runFileWorkflow(imports[0]?.id).catch(console.error);
    });

    const renderStoredBlocks = async () => {
        document.querySelectorAll(".block-sidebar-saved").forEach((item) => item.remove());
        const { simplyBlocks = [] } = await chrome.storage.local.get("simplyBlocks");
        simplyBlocks
            .filter((block) => block.type !== "file")
            .forEach((block, index) => {
            const item = createSidebarButton(block.name || "Block", block.url, "", "block-sidebar-saved");
            const icon = item.querySelector(".block-sidebar-icon");
            const image = document.createElement("img");
            image.alt = "";
            image.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(block.url)}&size=32`);
            image.addEventListener("error", () => { image.src = chrome.runtime.getURL("sbrc32.png"); }, { once: true });
            icon.append(image);
            item.addEventListener("click", () => activateBlockUrl(block.url).catch(console.error));
            item.style.top = `${446 + index * 56}px`;
            document.body.append(item);
        });
    };
    const renderEnvironmentBlocks = async () => {
        const canvas = document.getElementById("blockCanvas");
        const { simplyBlocks = [] } = await chrome.storage.local.get("simplyBlocks");
        canvas.querySelectorAll(".environment-block, .environment-block-connector, .environment-connection-line, .connection-hover-prompt, .environment-empty-state").forEach((item) => item.remove());
        if (!simplyBlocks.length) {
            const emptyState = document.createElement("section");
            emptyState.className = "environment-empty-state";
            emptyState.innerHTML = "<strong>Your workspace is ready</strong><span>Open Blocks in the sidebar to create your first block.</span>";
            canvas.append(emptyState);
        }
        const blockElements = new Map();
        const blockPositions = new Map();
        const updateConnectorFunctions = new Map();
        const connectPrompt = document.createElement("span");
        connectPrompt.className = "connection-hover-prompt";
        connectPrompt.textContent = "Connect to This Block";
        connectPrompt.hidden = true;
        canvas.append(connectPrompt);
        let disconnectPromptBlockId = null;
        const hideConnectPrompt = () => {
            connectPrompt.hidden = true;
            connectPrompt.classList.remove("actionable");
            disconnectPromptBlockId = null;
        };
        connectPrompt.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (!disconnectPromptBlockId) return;
            const latest = await chrome.storage.local.get("simplyBlocks");
            const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
            const stored = blocks.find((item) => item.id === disconnectPromptBlockId);
            if (stored) {
                delete stored.connectedToBlockId;
                delete stored.connectorPosition;
                stored.connectorDetached = false;
            }
            hideConnectPrompt();
            await chrome.storage.local.set({ simplyBlocks: blocks });
        });
        const updateAllConnectors = () => updateConnectorFunctions.forEach((update) => update());
        const blocksById = new Map(simplyBlocks.map((item) => [item.id, item]));
        const wouldCreateConnectionCycle = (sourceId, targetId) => {
            const visited = new Set();
            let currentId = targetId;
            while (currentId && !visited.has(currentId)) {
                if (currentId === sourceId) return true;
                visited.add(currentId);
                currentId = blocksById.get(currentId)?.connectedToBlockId;
            }
            return false;
        };
        let migratedLegacyConnections = false;
        simplyBlocks.forEach((block) => {
            if (!block.id) {
                block.id = crypto.randomUUID();
                migratedLegacyConnections = true;
            }
            if (block.connectionId || block.connectionOrder) {
                delete block.connectionId;
                delete block.connectionOrder;
                migratedLegacyConnections = true;
            }
        });

        simplyBlocks.forEach((block, index) => {
            const isFileBlock = block.type === "file";
            const element = document.createElement("div");
            const header = document.createElement("span");
            const icon = document.createElement("img");
            const name = document.createElement("span");
            const connector = document.createElement("span");
            const connectionLine = document.createElement("span");
            const fileDetail = document.createElement("span");
            const editButton = document.createElement("button");
            element.setAttribute("role", "button");
            element.tabIndex = 0;
            element.className = "environment-block";
            element.dataset.blockId = block.id;
            element.style.setProperty("--block-color", block.color || "#7c3aed");
            element.title = isFileBlock ? `${block.name || "File"} File-Block` : `${block.name || "Block"}\n${block.url}`;
            header.className = "environment-block-header";
            icon.className = "environment-block-icon";
            icon.alt = "";
            icon.draggable = false;
            if (isFileBlock) {
                icon.hidden = true;
                element.classList.add("environment-file-block");
            } else {
                icon.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(block.url)}&size=32`);
                icon.addEventListener("error", () => { icon.src = chrome.runtime.getURL("sbrc32.png"); }, { once: true });
            }
            name.className = "environment-block-name";
            name.textContent = block.name || "Block";
            fileDetail.className = "environment-file-detail";
            const fileActionLabel = block.lastFileAction === "exported"
                ? " · Exported"
                : block.lastFileAction === "opened-editor"
                    ? " · Opened in Live Editor"
                : block.lastFileAction === "updated"
                    ? " · Updated in chain"
                    : block.lastFileAction === "saved"
                        ? " · Saved to Drive"
                    : block.lastFileAction === "processing-ai"
                        ? " · AI processing…"
                        : block.lastFileAction === "processed-ai"
                            ? " · AI complete"
                            : block.lastFileAction === "ai-failed"
                                ? ` · ${block.fileError || "AI failed"}`
                    : block.lastFileAction === "save-failed"
                        ? " · Drive save failed"
                        : "";
            fileDetail.textContent = block.file?.name
                ? `${block.file.name}${fileActionLabel}`
                : block.fileError || fileActionLabel.replace(/^\s*·\s*/, "") ||
                    (isFileBlock && block.name === "Import" ? "Drop a Markdown file here" : "File-Block");
            connector.className = "environment-block-connector";
            connector.textContent = "Connect";
            connector.style.setProperty("--block-color", block.color || "#7c3aed");
            connectionLine.className = "environment-connection-line";
            connectionLine.dataset.connectionSourceId = block.id;
            connectionLine.style.setProperty("--block-color", block.color || "#7c3aed");
            header.append(icon, name);
            element.append(header);
            if (isFileBlock || block.file || block.lastFileAction || block.fileError) element.append(fileDetail);
            editButton.type = "button";
            editButton.className = "environment-block-edit";
            editButton.textContent = "✎";
            editButton.title = "Edit block";
            editButton.setAttribute("aria-label", `Edit ${block.name || "block"}`);
            editButton.addEventListener("pointerdown", (event) => event.stopPropagation());
            editButton.addEventListener("click", (event) => {
                event.stopPropagation();
                openEditBlockPopup(block);
            });
            element.append(editButton);
            canvas.append(connectionLine, element, connector);
            element.classList.toggle("file-flow-complete", flowProcessedBlockIds.has(block.id));
            connectionLine.classList.toggle("file-flow-complete", flowProcessedLineIds.has(block.id));

            const defaultPosition = { x: 110 + (index % 4) * 210, y: 70 + Math.floor(index / 4) * 125 };
            const clampPosition = (position) => ({
                x: Math.max(10, Math.min(position.x, canvas.clientWidth - element.offsetWidth - 10)),
                y: Math.max(10, Math.min(position.y, canvas.clientHeight - element.offsetHeight - 27))
            });
            let position = clampPosition(block.position || defaultPosition);
            blockElements.set(block.id, element);
            blockPositions.set(block.id, position);
            element.style.left = `${position.x}px`;
            element.style.top = `${position.y}px`;
            let connectedToBlockId = block.connectedToBlockId || null;
            let connectorDetached = Boolean(block.connectorDetached || connectedToBlockId);
            let connectorPosition = block.connectorPosition
                ? { ...block.connectorPosition }
                : { x: position.x + element.offsetWidth / 2, y: position.y + element.offsetHeight + 5 };
            if (connectedToBlockId) connector.classList.add("connected");
            else if (connectorDetached) connector.classList.add("active");
            const updateConnector = () => {
                const currentBlockPosition = blockPositions.get(block.id);
                const targetPosition = connectedToBlockId ? blockPositions.get(connectedToBlockId) : null;
                const targetElement = connectedToBlockId ? blockElements.get(connectedToBlockId) : null;
                if (targetPosition && targetElement) {
                    const incoming = simplyBlocks
                        .filter((item) => item.connectedToBlockId === connectedToBlockId)
                        .sort((first, second) => (first.createdAt || 0) - (second.createdAt || 0) || first.id.localeCompare(second.id));
                    const incomingIndex = Math.max(0, incoming.findIndex((item) => item.id === block.id));
                    const spacing = incoming.length > 1 ? 28 : 0;
                    const horizontalOffset = (incomingIndex - (incoming.length - 1) / 2) * spacing;
                    connectorPosition = {
                        x: targetPosition.x + targetElement.offsetWidth / 2 + horizontalOffset,
                        y: targetPosition.y - 10
                    };
                } else if (!connectorDetached) {
                    connectorPosition = {
                        x: currentBlockPosition.x + element.offsetWidth / 2,
                        y: currentBlockPosition.y + element.offsetHeight + 5
                    };
                }
                connector.style.left = `${connectorPosition.x}px`;
                connector.style.top = `${connectorPosition.y}px`;
                const startX = currentBlockPosition.x + element.offsetWidth / 2;
                const startY = currentBlockPosition.y + element.offsetHeight;
                const dx = connectorPosition.x - startX;
                const dy = connectorPosition.y - startY;
                connectionLine.style.left = `${startX}px`;
                connectionLine.style.top = `${startY}px`;
                connectionLine.style.width = `${Math.hypot(dx, dy)}px`;
                connectionLine.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
            };
            updateConnectorFunctions.set(block.id, updateConnector);
            updateConnector();
            let connectorDrag = null;
            let hoverTargetId = null;
            let hoverTargetAllowed = true;
            const clearConnectionTarget = () => {
                if (hoverTargetId) blockElements.get(hoverTargetId)?.classList.remove("connection-target", "connection-target-invalid");
                hoverTargetId = null;
                hoverTargetAllowed = true;
                hideConnectPrompt();
            };
            connector.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                if (connectedToBlockId) {
                    disconnectPromptBlockId = block.id;
                    connectPrompt.textContent = "Disconnect from This Block";
                    connectPrompt.style.left = `${connectorPosition.x}px`;
                    connectPrompt.style.top = `${connectorPosition.y - 8}px`;
                    connectPrompt.classList.add("actionable");
                    connectPrompt.hidden = false;
                    return;
                }
                connectorDetached = true;
                connectedToBlockId = null;
                connector.classList.remove("connected");
                connector.classList.add("active", "dragging");
                connectorDrag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin: { ...connectorPosition }
                };
                connector.setPointerCapture(event.pointerId);
            });
            connector.addEventListener("pointermove", (event) => {
                if (!connectorDrag || event.pointerId !== connectorDrag.pointerId) return;
                connectorPosition = {
                    x: Math.max(51, Math.min(connectorDrag.origin.x + event.clientX - connectorDrag.startX, canvas.clientWidth - 51)),
                    y: Math.max(10, Math.min(connectorDrag.origin.y + event.clientY - connectorDrag.startY, canvas.clientHeight - 38))
                };
                updateConnector();
                const target = simplyBlocks.find((candidate) => {
                    const targetElement = blockElements.get(candidate.id);
                    if (!targetElement) return false;
                    const bounds = targetElement.getBoundingClientRect();
                    return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
                });
                if (target?.id !== hoverTargetId) {
                    clearConnectionTarget();
                    if (target) {
                        hoverTargetId = target.id;
                        hoverTargetAllowed = target.id === block.id || !wouldCreateConnectionCycle(block.id, target.id);
                        const targetElement = blockElements.get(target.id);
                        const targetPosition = blockPositions.get(target.id);
                        targetElement.classList.add(hoverTargetAllowed ? "connection-target" : "connection-target-invalid");
                        connectPrompt.textContent = !hoverTargetAllowed
                            ? "Connection Not Allowed"
                            : target.id === block.id
                                ? "Return to This Block"
                                : "Connect to This Block";
                        connectPrompt.style.left = `${targetPosition.x + targetElement.offsetWidth / 2}px`;
                        connectPrompt.style.top = `${targetPosition.y - 8}px`;
                        connectPrompt.hidden = false;
                    }
                }
            });
            connector.addEventListener("pointerup", async (event) => {
                if (!connectorDrag || event.pointerId !== connectorDrag.pointerId) return;
                connectorDrag = null;
                connector.classList.remove("dragging");
                const droppedOnBlockId = hoverTargetAllowed ? hoverTargetId : null;
                clearConnectionTarget();
                const latest = await chrome.storage.local.get("simplyBlocks");
                const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
                const stored = blocks.find((item) => item.id === block.id);
                if (stored) {
                    if (droppedOnBlockId === block.id) {
                        delete stored.connectedToBlockId;
                        delete stored.connectorPosition;
                        stored.connectorDetached = false;
                    } else if (droppedOnBlockId) {
                        stored.connectorDetached = true;
                        const targetPosition = blockPositions.get(droppedOnBlockId);
                        const targetElement = blockElements.get(droppedOnBlockId);
                        stored.connectedToBlockId = droppedOnBlockId;
                        stored.connectorPosition = {
                            x: targetPosition.x + targetElement.offsetWidth / 2,
                            y: targetPosition.y - 10
                        };
                    } else {
                        stored.connectorDetached = true;
                        delete stored.connectedToBlockId;
                        stored.connectorPosition = connectorPosition;
                    }
                    await chrome.storage.local.set({ simplyBlocks: blocks });
                }
            });
            connector.addEventListener("pointercancel", () => {
                connectorDrag = null;
                connector.classList.remove("dragging");
                clearConnectionTarget();
            });
            connector.addEventListener("click", (event) => event.stopPropagation());
            let drag = null;
            let wasDragged = false;

            element.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                const members = [block];
                drag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    members,
                    origins: new Map(members.map((item) => [item.id, { ...blockPositions.get(item.id) }]))
                };
                wasDragged = false;
                members.forEach((item) => blockElements.get(item.id)?.classList.add("dragging"));
                element.setPointerCapture(event.pointerId);
            });
            if (isFileBlock && block.name === "Import") {
                element.addEventListener("dragover", (event) => {
                    if (!event.dataTransfer?.types.includes("Files")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    element.classList.add("file-drop-target");
                });
                element.addEventListener("dragleave", () => element.classList.remove("file-drop-target"));
                element.addEventListener("drop", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    element.classList.remove("file-drop-target");
                    const file = event.dataTransfer?.files?.[0];
                    if (!file) return;
                    try {
                        const serialized = await serializeFile(file);
                        const latest = await chrome.storage.local.get("simplyBlocks");
                        const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
                        const stored = blocks.find((item) => item.id === block.id);
                        if (!stored) return;
                        stored.file = serialized;
                        await chrome.storage.local.set({ simplyBlocks: blocks });
                    } catch (error) {
                        console.error("The dropped file could not be attached:", error);
                        fileDetail.textContent = error?.message || "File could not be attached";
                        element.classList.add("file-drop-error");
                        setTimeout(() => element.classList.remove("file-drop-error"), 1800);
                    }
                });
            }
            element.addEventListener("pointermove", (event) => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                let dx = event.clientX - drag.startX;
                let dy = event.clientY - drag.startY;
                if (Math.hypot(dx, dy) > 4) wasDragged = true;
                if (wasDragged) {
                    const panel = document.querySelector(".side-panel");
                    const deleteBoundary = panel?.classList.contains("expanded")
                        ? Math.max(76, panel.getBoundingClientRect().right)
                        : 76;
                    document.body.classList.toggle("block-sidebar-delete-ready", event.clientX <= deleteBoundary);
                }
                const minDx = Math.max(...drag.members.map((item) => 10 - drag.origins.get(item.id).x));
                const maxDx = Math.min(...drag.members.map((item) => canvas.clientWidth - blockElements.get(item.id).offsetWidth - 10 - drag.origins.get(item.id).x));
                const minDy = Math.max(...drag.members.map((item) => 10 - drag.origins.get(item.id).y));
                const maxDy = Math.min(...drag.members.map((item) => canvas.clientHeight - blockElements.get(item.id).offsetHeight - 27 - drag.origins.get(item.id).y));
                dx = Math.max(minDx, Math.min(dx, maxDx));
                dy = Math.max(minDy, Math.min(dy, maxDy));
                drag.members.forEach((item) => {
                    const origin = drag.origins.get(item.id);
                    const next = { x: origin.x + dx, y: origin.y + dy };
                    blockPositions.set(item.id, next);
                    const memberElement = blockElements.get(item.id);
                    memberElement.style.left = `${next.x}px`;
                    memberElement.style.top = `${next.y}px`;
                });
                updateAllConnectors();
                position = blockPositions.get(block.id);
            });
            element.addEventListener("pointerup", async (event) => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                const draggedMembers = drag.members;
                drag = null;
                draggedMembers.forEach((item) => blockElements.get(item.id)?.classList.remove("dragging"));
                const panel = document.querySelector(".side-panel");
                const deleteBoundary = panel?.classList.contains("expanded")
                    ? Math.max(76, panel.getBoundingClientRect().right)
                    : 76;
                const droppedOnSidebar = wasDragged && event.clientX <= deleteBoundary;
                document.body.classList.remove("block-sidebar-delete-ready");
                if (droppedOnSidebar) {
                    try {
                        await deleteBlockById(block.id);
                    } catch (error) {
                        window.alert(error?.message || "The block could not be deleted.");
                    }
                    wasDragged = false;
                    return;
                }
                if (!wasDragged) return;
                const latest = await chrome.storage.local.get("simplyBlocks");
                const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
                draggedMembers.forEach((item) => {
                    const stored = blocks.find((candidate) => candidate.id === item.id);
                    if (stored) stored.position = blockPositions.get(item.id);
                });

                await chrome.storage.local.set({ simplyBlocks: blocks });
            });
            element.addEventListener("pointercancel", () => {
                drag = null;
                wasDragged = false;
                element.classList.remove("dragging");
                document.body.classList.remove("block-sidebar-delete-ready");
            });
            element.addEventListener("click", async (event) => {
                if (wasDragged) {
                    event.preventDefault();
                    wasDragged = false;
                    return;
                }
                if (block.url) await activateBlockUrl(block.url);
            });
            element.addEventListener("keydown", (event) => {
                if ((event.key === "Enter" || event.key === " ") && event.target === element) {
                    event.preventDefault();
                    element.click();
                }
            });
        });
        updateAllConnectors();
        if (migratedLegacyConnections) chrome.storage.local.set({ simplyBlocks }).catch(console.error);
    };
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.simplyBlocks) {
            renderStoredBlocks().catch(console.error);
            renderEnvironmentBlocks().catch(console.error);
        }
    });

    fullscreenButton.setAttribute("aria-pressed", "false");
    sidePanelButton.setAttribute("aria-pressed", "false");

    newTabButton.addEventListener("click", () => {
        chrome.tabs.create({});
    });

    let restoreWindowState = "normal";

    async function updateFullscreenState() {
        const currentWindow = await chrome.windows.getCurrent();
        const isFullscreen =
            currentWindow.state === "fullscreen" ||
            Boolean(document.fullscreenElement);

        fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
    }

    fullscreenButton.addEventListener("click", async () => {
        fullscreenButton.disabled = true;

        try {
            const currentWindow = await chrome.windows.getCurrent();

            if (
                currentWindow.state === "fullscreen" ||
                document.fullscreenElement
            ) {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await chrome.windows.update(currentWindow.id, {
                        state: restoreWindowState
                    });
                }
            } else {
                restoreWindowState =
                    currentWindow.state === "maximized"
                        ? "maximized"
                        : "normal";
                await chrome.windows.update(currentWindow.id, {
                    state: "fullscreen"
                });
            }
        } catch (error) {
            console.error("Fullscreen mode could not be toggled:", error);
        } finally {
            fullscreenButton.disabled = false;
            await updateFullscreenState().catch(() => null);
        }
    });

    let sidePanelIsOpen = false;
    let sidePanelWindowId = null;
    let openedSidePanelWindowId = null;
    let sidePanelTabId = null;
    let sidePanelConfigurationReady = false;

    async function closeSidePanelIfOpen(options) {
        try {
            await chrome.sidePanel.close(options);
        } catch (error) {
            const noActivePanel =
                error?.message?.includes("No active") ||
                error?.message?.includes("not open");

            if (!noActivePanel) {
                throw error;
            }
        }
    }

    async function prepareSidePanel() {
        const [currentTab, currentWindow] = await Promise.all([
            chrome.tabs.getCurrent(),
            chrome.windows.getCurrent()
        ]);

        if (currentTab?.id == null || currentWindow?.id == null) {
            throw new Error(
                "The current block environment tab could not be identified."
            );
        }

        await closeSidePanelIfOpen({
            windowId: currentWindow.id
        });
        sidePanelIsOpen = false;
        openedSidePanelWindowId = null;
        sidePanelButton.setAttribute("aria-pressed", "false");

        await chrome.sidePanel.setOptions({
            path: "index.html",
            enabled: true
        });

        sidePanelTabId = currentTab.id;
        sidePanelWindowId = currentWindow.id;
        sidePanelConfigurationReady = true;
        sidePanelButton.disabled = false;
        sidePanelButton.title = "Toggle the side panel";
    }

    if (chrome.sidePanel.onOpened) {
        chrome.sidePanel.onOpened.addListener((info) => {
            sidePanelIsOpen = true;
            openedSidePanelWindowId = info.windowId;
            sidePanelButton.setAttribute("aria-pressed", "true");
        });
    }

    if (chrome.sidePanel.onClosed) {
        chrome.sidePanel.onClosed.addListener((info) => {
            if (openedSidePanelWindowId === info.windowId) {
                sidePanelIsOpen = false;
                openedSidePanelWindowId = null;
                sidePanelButton.setAttribute("aria-pressed", "false");
            }
        });
    }

    document.addEventListener("simplyBlocksProfileSidePanelOpened", (event) => {
        sidePanelIsOpen = true;
        openedSidePanelWindowId =
            event.detail?.windowId ?? sidePanelWindowId;
        sidePanelButton.setAttribute("aria-pressed", "true");
    });

    sidePanelButton.addEventListener("click", async () => {
        sidePanelButton.disabled = true;

        try {
            if (
                !sidePanelConfigurationReady ||
                sidePanelTabId == null ||
                sidePanelWindowId == null
            ) {
                return;
            }

            const panelAlreadyOpen =
                sidePanelIsOpen &&
                openedSidePanelWindowId === sidePanelWindowId;

            if (panelAlreadyOpen) {
                await closeSidePanelIfOpen({
                    windowId: sidePanelWindowId
                });
                sidePanelIsOpen = false;
                sidePanelButton.setAttribute("aria-pressed", "false");
                return;
            }

            await chrome.sidePanel.setOptions({
                path: "index.html",
                enabled: true
            });
            await chrome.sidePanel.open({
                windowId: sidePanelWindowId
            });
            sidePanelIsOpen = true;
            openedSidePanelWindowId = sidePanelWindowId;
            sidePanelButton.setAttribute("aria-pressed", "true");
        } catch (error) {
            console.error("The side panel could not be toggled:", error);
        } finally {
            sidePanelButton.disabled = !sidePanelConfigurationReady;
        }
    });

    document.body.append(newTabButton, fullscreenButton, sidePanelButton, blocksButton, fileBlockButton, flowButton);
    updateFlowButton();
    renderStoredBlocks().catch(console.error);
    renderEnvironmentBlocks().catch(console.error);
    sidePanelButton.disabled = true;
    sidePanelButton.title = "Preparing the side panel";
    document.addEventListener("fullscreenchange", () => {
        updateFullscreenState().catch(() => null);
    });
    chrome.windows.onBoundsChanged.addListener(() => {
        updateFullscreenState().catch(() => null);
    });
    updateFullscreenState().catch(() => null);
    prepareSidePanel().catch((error) => {
        sidePanelButton.disabled = true;
        sidePanelButton.title = "The side panel could not be prepared";
        console.error("The side panel could not be prepared:", error);
    });
}

document.addEventListener(
    "simplyBlocksWorkspacePanelReady",
    addBlockSidebarButtons,
    { once: true }
);
addBlockSidebarButtons();
