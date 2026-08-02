const profile = document.getElementById("settings");

profile.addEventListener("click", () => {
    window.location.replace("profile.html");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "simplyBlocksShowProfile") {
        return;
    }

    sendResponse({ navigating: true });
    window.location.replace("profile.html");
});
