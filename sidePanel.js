import { isSignedIn } from "./auth.js";

try {
    const signedIn = await isSignedIn();
    window.location.replace(signedIn ? "index.html" : "notSignedIn.html");
} catch (error) {
    console.error("Sign-in status could not be checked:", error);
    window.location.replace("notSignedIn.html");
}
