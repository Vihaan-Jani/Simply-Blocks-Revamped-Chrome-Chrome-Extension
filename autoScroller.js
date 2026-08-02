const autoScrollCard = document.getElementById("autoScrollCard");
const autoScrollStatus = document.getElementById("autoScrollStatus");
const speedButtons = [...document.querySelectorAll(".speed-option")];
let controlledTabId = null;
let activeSpeed = null;

function isScrollableWebsite(tab) {
    const extensionPages = new Set([
        chrome.runtime.getURL("editorenvironment.html"),
        chrome.runtime.getURL("blockenvironment.html")
    ]);

    return (
        tab?.id != null &&
        typeof tab.url === "string" &&
        (
            /^(https?|file):/.test(tab.url) ||
            extensionPages.has(tab.url)
        )
    );
}

async function findTargetTab() {
    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (isScrollableWebsite(activeTab)) {
        return activeTab;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });

    return tabs
        .filter(isScrollableWebsite)
        .sort((first, second) =>
            (second.lastAccessed || 0) - (first.lastAccessed || 0)
        )[0] || null;
}

function showState(running, speed = null, message = null) {
    activeSpeed = running ? speed : null;
    autoScrollStatus.textContent =
        message || (running
            ? `${speed[0].toUpperCase()}${speed.slice(1)}`
            : "Stopped");
    autoScrollStatus.classList.toggle("active", running);

    speedButtons.forEach((button) => {
        const selected = running && button.dataset.speed === speed;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
}

async function toggleAutoScroll(speed) {
    showState(false, null, "Starting...");

    try {
        const targetTab = await findTargetTab();

        if (!targetTab) {
            showState(false, null, "No website");
            return;
        }

        const response = await chrome.tabs.sendMessage(targetTab.id, {
            type: "simplyBlocksToggleAutoScroll",
            speed
        });

        controlledTabId = targetTab.id;
        showState(response?.running === true, response?.speed || speed);

        if (!targetTab.active) {
            await chrome.tabs.update(targetTab.id, { active: true });
            await chrome.windows.update(targetTab.windowId, { focused: true });
        }
    } catch (error) {
        console.error("Auto-scroll could not be started:", error);
        showState(false, null, "Unavailable");
    }
}

speedButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleAutoScroll(button.dataset.speed);
    });
});

autoScrollCard.addEventListener("click", () => {
    toggleAutoScroll(activeSpeed || "medium");
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (
        message?.type === "simplyBlocksAutoScrollEnded" &&
        sender.tab?.id === controlledTabId
    ) {
        showState(false);
    }
});
