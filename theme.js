const TEXT_COLOR_STORAGE_KEY = "textGradientColor";
const BACKGROUND_COLOR_STORAGE_KEY = "middleBackgroundColor";
const GLOW_START_STORAGE_KEY = "glowStartColor";
const GLOW_END_STORAGE_KEY = "glowEndColor";

function toRgb(value) {
    if (!Array.isArray(value) || value.length !== 3) {
        return null;
    }

    const channels = value.map((channel) => {
        const number = Number(channel);
        return Math.min(255, Math.max(0, Number.isFinite(number) ? number : 0));
    });

    return `rgb(${channels.join(", ")})`;
}

function applyThemeColor(storageKey, cssVariable) {
    const color = toRgb(JSON.parse(localStorage.getItem(storageKey)));

    if (color) {
        document.documentElement.style.setProperty(cssVariable, color);
    }
}

try {
    applyThemeColor(TEXT_COLOR_STORAGE_KEY, "--text-gradient-color");
    applyThemeColor(BACKGROUND_COLOR_STORAGE_KEY, "--middle-background-color");
    applyThemeColor(GLOW_START_STORAGE_KEY, "--glow-start-color");
    applyThemeColor(GLOW_END_STORAGE_KEY, "--glow-end-color");
} catch (error) {
    console.warn("Saved theme colors could not be loaded:", error);
}

window.addEventListener("storage", (event) => {
    const variables = {
        [TEXT_COLOR_STORAGE_KEY]: "--text-gradient-color",
        [BACKGROUND_COLOR_STORAGE_KEY]: "--middle-background-color",
        [GLOW_START_STORAGE_KEY]: "--glow-start-color",
        [GLOW_END_STORAGE_KEY]: "--glow-end-color"
    };
    const cssVariable = variables[event.key];

    if (!cssVariable || !event.newValue) {
        return;
    }

    try {
        const color = toRgb(JSON.parse(event.newValue));

        if (color) {
            document.documentElement.style.setProperty(cssVariable, color);
        }
    } catch (error) {
        console.warn("Updated theme color could not be applied:", error);
    }
});
