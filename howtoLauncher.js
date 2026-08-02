function initializeHowToLauncher() {
    const howToCard = document.querySelector("#howToCard");
    if (!howToCard) return;

    const openHowTo = () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL("howto.html"),
            active: true
        }).catch((error) => {
            console.error("The How To tab could not be opened:", error);
        });
    };

    howToCard.addEventListener("click", openHowTo);
    howToCard.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openHowTo();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHowToLauncher, { once: true });
} else {
    initializeHowToLauncher();
}
