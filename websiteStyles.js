const WEBSITE_STYLES_STORAGE_KEY = "websiteStylesEnabled";
const WEBSITE_BACKGROUND_STORAGE_KEY = "websiteMiddleBackgroundColor";
const DEFAULT_BACKGROUND_COLOR = [34, 10, 56];
const AUTO_SCROLL_SPEEDS = {
    slow: 60,
    medium: 120,
    fast: 240
};

let autoScrollFrame = null;
let autoScrollSpeed = null;
let previousFrameTime = null;

function stopAutoScroll(notify = false) {
    if (autoScrollFrame !== null) {
        cancelAnimationFrame(autoScrollFrame);
    }

    autoScrollFrame = null;
    autoScrollSpeed = null;
    previousFrameTime = null;

    if (notify) {
        chrome.runtime.sendMessage({
            type: "simplyBlocksAutoScrollEnded"
        }).catch(() => {});
    }
}

function runAutoScroll(frameTime) {
    if (!autoScrollSpeed) {
        return;
    }

    if (previousFrameTime !== null) {
        const elapsedSeconds = Math.min(
            (frameTime - previousFrameTime) / 1000,
            0.1
        );
        const editorScroller = document.querySelector(".editor-workspace");
        const scrollTarget = editorScroller || document.scrollingElement;
        const currentScrollTop = editorScroller
            ? editorScroller.scrollTop
            : window.scrollY;
        const viewportHeight = editorScroller
            ? editorScroller.clientHeight
            : window.innerHeight;
        const maxScrollTop = scrollTarget.scrollHeight - viewportHeight;
        const nextScrollTop = Math.min(
            maxScrollTop,
            currentScrollTop + autoScrollSpeed * elapsedSeconds
        );

        if (editorScroller) {
            editorScroller.scrollTo({
                top: nextScrollTop,
                behavior: "auto"
            });
        } else {
            window.scrollTo(window.scrollX, nextScrollTop);
        }

        if (currentScrollTop >= maxScrollTop - 1) {
            stopAutoScroll(true);
            return;
        }
    }

    previousFrameTime = frameTime;
    autoScrollFrame = requestAnimationFrame(runAutoScroll);
}

function toggleAutoScroll(speedName) {
    if (!AUTO_SCROLL_SPEEDS[speedName]) {
        return { running: false, error: "Unknown speed" };
    }

    if (autoScrollSpeed === AUTO_SCROLL_SPEEDS[speedName]) {
        stopAutoScroll();
        return { running: false, speed: speedName };
    }

    stopAutoScroll();
    autoScrollSpeed = AUTO_SCROLL_SPEEDS[speedName];
    autoScrollFrame = requestAnimationFrame(runAutoScroll);

    return { running: true, speed: speedName };
}

function normalizeColor(value) {
    if (!Array.isArray(value) || value.length !== 3) {
        return DEFAULT_BACKGROUND_COLOR;
    }

    return value.map((channel) => {
        const number = Number(channel);
        return Math.min(255, Math.max(0, Number.isFinite(number) ? number : 0));
    });
}

function applyWebsiteStyles(enabled, backgroundColor) {
    const root = document.documentElement;
    const channels = normalizeColor(backgroundColor);

    root.classList.toggle("simply-blocks-styles-enabled", enabled);
    root.style.setProperty(
        "--simply-blocks-middle-background-color",
        `rgb(${channels.join(", ")})`
    );
}

chrome.storage.local
    .get({
        [WEBSITE_STYLES_STORAGE_KEY]: true,
        [WEBSITE_BACKGROUND_STORAGE_KEY]: DEFAULT_BACKGROUND_COLOR
    })
    .then((settings) => {
        applyWebsiteStyles(
            settings[WEBSITE_STYLES_STORAGE_KEY] !== false,
            settings[WEBSITE_BACKGROUND_STORAGE_KEY]
        );
    })
    .catch((error) => {
        console.error("Simply Blocks website styles failed to load:", error);
        applyWebsiteStyles(true, DEFAULT_BACKGROUND_COLOR);
    });

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName !== "local" ||
        (
            !changes[WEBSITE_STYLES_STORAGE_KEY] &&
            !changes[WEBSITE_BACKGROUND_STORAGE_KEY]
        )
    ) {
        return;
    }

    chrome.storage.local
        .get({
            [WEBSITE_STYLES_STORAGE_KEY]: true,
            [WEBSITE_BACKGROUND_STORAGE_KEY]: DEFAULT_BACKGROUND_COLOR
        })
        .then((settings) => {
            const enabled = settings[WEBSITE_STYLES_STORAGE_KEY] !== false;
            applyWebsiteStyles(enabled, settings[WEBSITE_BACKGROUND_STORAGE_KEY]);
            updateWebsiteStylesButton(enabled);
        });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "simplyBlocksShortcutGroupEligibility") {
        setShortcutSidePanelButtonVisibility(Boolean(message.eligible));
        return;
    }
    if (message?.type !== "simplyBlocksToggleAutoScroll") {
        return;
    }

    sendResponse(toggleAutoScroll(message.speed));
});

let shortcutPanelHost = null;
let shortcutPanelButton = null;
let websiteStylesButton = null;

function updateWebsiteStylesButton(enabled) {
    if (!websiteStylesButton) return;
    websiteStylesButton.setAttribute("aria-pressed", String(enabled));
    websiteStylesButton.title = enabled
        ? "Disable Simply Blocks Custom UI"
        : "Enable Simply Blocks Custom UI";
    websiteStylesButton.setAttribute("aria-label", websiteStylesButton.title);
    const label = websiteStylesButton.querySelector("span");
    if (label) label.textContent = enabled ? "Custom UI On" : "Custom UI Off";
}

function ensureShortcutSidePanelButton() {
    if (shortcutPanelHost?.isConnected) return;
    shortcutPanelHost = document.createElement("div");
    shortcutPanelHost.id = "simply-blocks-page-panel-control";
    shortcutPanelHost.style.cssText = "all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;display:block";
    const shadow = shortcutPanelHost.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    shortcutPanelButton = document.createElement("button");
    websiteStylesButton = document.createElement("button");
    style.textContent = `
        .controls { display:flex; flex-direction:column; align-items:stretch; gap:8px; }
        button { box-sizing:border-box; min-height:44px; display:flex; align-items:center; gap:10px; padding:9px 14px; border:1px solid rgba(192,132,252,.3); border-radius:13px; color:#f1f5f9; background:linear-gradient(145deg,rgba(15,23,42,.97),rgba(6,8,20,.97)); box-shadow:0 14px 34px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06); font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; letter-spacing:.01em; cursor:pointer; transition:border-color .18s ease,background .18s ease,transform .18s ease; }
        button[hidden] { display:none; }
        button:hover { border-color:rgba(192,132,252,.65); background:linear-gradient(145deg,rgba(49,46,129,.96),rgba(15,23,42,.98)); transform:translateY(-1px); }
        button:focus-visible { outline:2px solid #818cf8; outline-offset:3px; }
        button[aria-pressed="true"] { border-color:#a78bfa; background:linear-gradient(145deg,rgba(76,29,149,.97),rgba(30,41,59,.98)); }
        button:disabled { opacity:.7; cursor:wait; }
        svg { width:19px; height:19px; fill:none; stroke:#c4b5fd; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    `;
    shortcutPanelButton.type = "button";
    shortcutPanelButton.title = "Toggle Simply Blocks Side Panel";
    shortcutPanelButton.setAttribute("aria-label", "Toggle Simply Blocks Side Panel");
    shortcutPanelButton.setAttribute("aria-pressed", "false");
    shortcutPanelButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16"></path><path d="M6 9h0M6 13h0"></path></svg><span>Simply Blocks</span>';
    shortcutPanelButton.addEventListener("click", async () => {
        shortcutPanelButton.disabled = true;
        try {
            const result = await chrome.runtime.sendMessage({ type: "simplyBlocksTogglePageSidePanel" });
            if (result?.error) throw new Error(result.error);
            shortcutPanelButton.setAttribute("aria-pressed", String(Boolean(result?.open)));
        } catch (error) {
            console.error("Simply Blocks side panel could not be toggled:", error);
        } finally {
            shortcutPanelButton.disabled = false;
        }
    });

    websiteStylesButton.type = "button";
    websiteStylesButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a2 2 0 0 1-2-2V5a2 2 0 0 0-2.8-2Z"></path><circle cx="7.5" cy="10.5" r="1"></circle><circle cx="10" cy="7" r="1"></circle><circle cx="7.5" cy="15" r="1"></circle></svg><span>Custom UI</span>';
    websiteStylesButton.addEventListener("click", async () => {
        websiteStylesButton.disabled = true;
        try {
            const settings = await chrome.storage.local.get({
                [WEBSITE_STYLES_STORAGE_KEY]: true,
                [WEBSITE_BACKGROUND_STORAGE_KEY]: DEFAULT_BACKGROUND_COLOR
            });
            const enabled = settings[WEBSITE_STYLES_STORAGE_KEY] === false;
            await chrome.storage.local.set({
                [WEBSITE_STYLES_STORAGE_KEY]: enabled
            });
            applyWebsiteStyles(enabled, settings[WEBSITE_BACKGROUND_STORAGE_KEY]);
            updateWebsiteStylesButton(enabled);
        } catch (error) {
            console.error("Simply Blocks custom UI could not be toggled:", error);
        } finally {
            websiteStylesButton.disabled = false;
        }
    });

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(shortcutPanelButton, websiteStylesButton);
    shadow.append(style, controls);
    document.documentElement.append(shortcutPanelHost);

    chrome.storage.local.get({ [WEBSITE_STYLES_STORAGE_KEY]: true })
        .then((settings) => updateWebsiteStylesButton(
            settings[WEBSITE_STYLES_STORAGE_KEY] !== false
        ))
        .catch(() => updateWebsiteStylesButton(true));
}

function setShortcutSidePanelButtonVisibility(visible) {
    ensureShortcutSidePanelButton();
    shortcutPanelButton.hidden = !visible;
    if (!visible) shortcutPanelButton.setAttribute("aria-pressed", "false");
}

chrome.runtime.sendMessage({ type: "simplyBlocksCheckShortcutGroup" })
    .then((result) => setShortcutSidePanelButtonVisibility(Boolean(result?.eligible)))
    .catch(() => setShortcutSidePanelButtonVisibility(false));
