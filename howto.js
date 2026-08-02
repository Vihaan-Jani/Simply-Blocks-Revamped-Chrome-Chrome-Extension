function applyBackgroundColor(values) {
    if (!Array.isArray(values) || values.length !== 3) return;

    const channels = values.map((value) => {
        const channel = Number(value);
        return Math.min(255, Math.max(0, Number.isFinite(channel) ? channel : 0));
    });

    document.documentElement.style.setProperty(
        "--middle-background-color",
        `rgb(${channels.join(", ")})`
    );
}

async function initializeHowToBackground() {
    try {
        const { middleBackgroundColor } = await chrome.storage.local.get(
            "middleBackgroundColor"
        );
        applyBackgroundColor(middleBackgroundColor);
    } catch (error) {
        console.warn("The saved background color could not be loaded:", error);
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.middleBackgroundColor) {
            applyBackgroundColor(changes.middleBackgroundColor.newValue);
        }
    });
}

initializeHowToBackground();
