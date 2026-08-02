import { signIn } from "./auth.js";

const signInButton = document.getElementById("googleSignIn");
const signInStatus = document.getElementById("signInStatus");
const signInError = document.getElementById("signInError");
const howToButton = document.getElementById("googleHowTo");
const howToStatus = document.getElementById("howToStatus");

signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;
    signInStatus.textContent = "Signing in...";
    signInError.textContent = "";

    try {
        await signIn();
        window.location.replace("index.html");
    } catch (error) {
        console.error("Google sign-in failed:", error);
        signInError.textContent =
            error?.message || "Google sign-in could not be completed.";
        signInStatus.textContent = "Try again";
        signInButton.disabled = false;
    }
});

howToButton.addEventListener("click", async () => {
    howToButton.disabled = true;
    howToStatus.textContent = "Opening...";
    signInError.textContent = "";

    try {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (activeTab?.id == null) {
            throw new Error("The active tab could not be found.");
        }

        await chrome.tabs.update(activeTab.id, {
            url: chrome.runtime.getURL("howto.html"),
            active: true
        });
        howToStatus.textContent = "Opened";
    } catch (error) {
        console.error("The Google setup guide could not be opened:", error);
        signInError.textContent =
            error?.message || "The setup guide could not be opened.";
        howToStatus.textContent = "Try again";
        howToButton.disabled = false;
    }
});
