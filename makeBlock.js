const backToEditor = document.getElementById("backToEditor");
const createBlock = document.getElementById("createBlock");
const urlInput = document.getElementById("urlInput");
const blockNameInput = document.getElementById("blockNameInput");
const blockColorInput = document.getElementById("blockColorInput");
const removeBlock = document.getElementById("removeBlock");
const removeBlockOverlay = document.getElementById("removeBlockOverlay");
const savedBlockList = document.getElementById("savedBlockList");
const removeBlockEmpty = document.getElementById("removeBlockEmpty");
const cancelRemoveBlock = document.getElementById("cancelRemoveBlock");
const blockFormStatus = document.getElementById("blockFormStatus");

function setFormStatus(message, kind = "") {
    blockFormStatus.textContent = message;
    blockFormStatus.dataset.kind = kind;
}

async function showRemoveBlockPopup() {
    const { simplyBlocks = [] } = await chrome.storage.local.get("simplyBlocks");
    savedBlockList.replaceChildren();
    removeBlockEmpty.hidden = simplyBlocks.length > 0;
    simplyBlocks.forEach((block) => {
        const isFileBlock = block.type === "file";
        const button = document.createElement("button");
        const icon = document.createElement("img");
        const text = document.createElement("span");
        const title = document.createElement("strong");
        const url = document.createElement("small");
        button.type = "button";
        button.className = "saved-block-option";
        icon.alt = "";
        if (isFileBlock) {
            icon.src = chrome.runtime.getURL("sbrc32.png");
        } else {
            icon.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(block.url)}&size=32`);
            icon.addEventListener("error", () => { icon.src = chrome.runtime.getURL("sbrc32.png"); }, { once: true });
        }
        title.textContent = block.name || "Block";
        url.textContent = isFileBlock ? "File-Block · No URL" : block.url;
        text.append(title, url);
        button.append(icon, text);
        button.addEventListener("click", async () => {
            const latest = await chrome.storage.local.get("simplyBlocks");
            const blocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
            const remaining = blocks.filter((item) => item.id !== block.id);
            remaining.forEach((item) => {
                if (item.connectedToBlockId === block.id) {
                    delete item.connectedToBlockId;
                    item.connectorDetached = true;
                }
            });
            const connectionCounts = new Map();
            remaining.forEach((item) => {
                if (item.connectionId) connectionCounts.set(item.connectionId, (connectionCounts.get(item.connectionId) || 0) + 1);
            });
            remaining.forEach((item) => {
                if (item.connectionId && connectionCounts.get(item.connectionId) < 2) {
                    delete item.connectionId;
                    delete item.connectionOrder;
                }
            });
            await chrome.storage.local.set({ simplyBlocks: remaining });
            await showRemoveBlockPopup();
        });
        savedBlockList.append(button);
    });
    removeBlockOverlay.hidden = false;
}

removeBlock.addEventListener("click", () => showRemoveBlockPopup().catch(console.error));
cancelRemoveBlock.addEventListener("click", () => { removeBlockOverlay.hidden = true; });
removeBlockOverlay.addEventListener("click", (event) => {
    if (event.target === removeBlockOverlay) removeBlockOverlay.hidden = true;
});


backToEditor.addEventListener("click", async () => {

    if (new URLSearchParams(location.search).get("embedded") === "1") {
        window.parent.postMessage({ type: "simplyBlocksCloseBlockManager" }, location.origin);
        return;
    }

    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    await chrome.tabs.update(tabs[0].id, {
        url: chrome.runtime.getURL("blockenvironment.html")
    });

});


async function getStoredGroup() {

    const data = await chrome.storage.local.get("simplyBlocksGroup");

    if (data.simplyBlocksGroup) {

        try {

            await chrome.tabGroups.get(data.simplyBlocksGroup);

            return data.simplyBlocksGroup;

        } catch {

            await chrome.storage.local.remove("simplyBlocksGroup");

        }

    }

    return null;

}



async function createSimplyBlocksGroup(tabId) {

    const groupId = await chrome.tabs.group({
        tabIds: [tabId]
    });


    await chrome.tabGroups.update(groupId, {

        title: "Simply Blocks",

        color: "blue",

        collapsed: false

    });


    await chrome.storage.local.set({

        simplyBlocksGroup: groupId

    });


    return groupId;

}



async function saveBlock() {
    if (createBlock.disabled) return;
    createBlock.disabled = true;
    setFormStatus("Creating block…");

    let url = urlInput.value.trim();


    if (!url) {
        setFormStatus("Enter a URL to create a block.", "error");
        urlInput.focus();
        createBlock.disabled = false;
        return;
    }


    if (!url.startsWith("http://") && !url.startsWith("https://")) {

        url = "https://" + url;

    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Unsupported URL protocol");
        url = parsedUrl.href;
    } catch {
        setFormStatus("Enter a valid website URL.", "error");
        urlInput.focus();
        createBlock.disabled = false;
        return;
    }

    const stored = await chrome.storage.local.get("simplyBlocks");
    const blocks = Array.isArray(stored.simplyBlocks) ? stored.simplyBlocks : [];
    const block = {
        id: crypto.randomUUID(),
        name: blockNameInput.value.trim() || parsedUrl.hostname.replace(/^www\./, ""),
        color: blockColorInput.value,
        url,
        createdAt: Date.now(),
        position: null
    };
    blocks.push(block);
    await chrome.storage.local.set({ simplyBlocks: blocks });



    try {
    const tabs = await chrome.tabs.query({});


    let tab = tabs.find(
        tab => tab.url === url
    );


    let groupId = await getStoredGroup();
    if (groupId) {
        const group = await chrome.tabGroups.get(groupId);
        if (!tab || tab.windowId !== group.windowId) {
            tab = await chrome.tabs.create({ url, active: false, windowId: group.windowId });
        }
        await chrome.tabs.group({ tabIds: [tab.id], groupId });
    } else {
        if (!tab) {

        tab = await chrome.tabs.create({

            url: url,

            active: false

        });

    }



        groupId = await createSimplyBlocksGroup(tab.id);
    }


    urlInput.value = "";
    blockNameInput.value = "";
    setFormStatus("Block created.", "success");
    } catch (error) {
        console.error("Block tab could not be grouped:", error);
        setFormStatus("The block was saved, but its tab could not be grouped.", "error");
    } finally {
        createBlock.disabled = false;
    }
}

createBlock.addEventListener("click", saveBlock);
[urlInput, blockNameInput].forEach((input) => input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveBlock();
}));
