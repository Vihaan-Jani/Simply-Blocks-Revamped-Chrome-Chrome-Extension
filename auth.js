const USER_STORAGE_KEY = "googleUser";

export async function getGoogleToken(interactive = false) {
    const result = await chrome.identity.getAuthToken({
        interactive
    });

    const token =
        typeof result === "string"
            ? result
            : result?.token;

    if (!token) {
        throw new Error("Google did not return an access token.");
    }

    return token;
}

export async function signIn() {
    const token = await getGoogleToken(true);

    try {
        const profile = await fetchGoogleProfile(token);

        const user = {
            id: profile.sub,
            name: profile.name || "",
            firstName: profile.given_name || "",
            email: profile.email || "",
            picture: profile.picture || "",
            signedIn: true
        };

        await chrome.storage.local.set({
            [USER_STORAGE_KEY]: user
        });

        return user;
    } catch (error) {
        await removeCachedToken(token);
        throw error;
    }
}

async function fetchGoogleProfile(token) {
    const response = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error_description ||
            data.error?.message ||
            data.error ||
            "Unable to retrieve Google profile."
        );
    }

    return data;
}

export async function getCurrentUser() {
    const result = await chrome.storage.local.get(
        USER_STORAGE_KEY
    );

    return result[USER_STORAGE_KEY] || null;
}

export async function isSignedIn() {
    const user = await getCurrentUser();

    if (!user?.signedIn) {
        return false;
    }

    try {
        await getGoogleToken(false);
        return true;
    } catch {
        return false;
    }
}

export async function signOut() {
    let token = null;

    try {
        token = await getGoogleToken(false);
    } catch {
        console.log("No cached Google token found.");
    }

    if (token) {
        try {
            await fetch(
                `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    }
                }
            );
        } catch (error) {
            console.warn(
                "Google token revocation failed:",
                error
            );
        }

        await removeCachedToken(token);
    }

    await chrome.identity.clearAllCachedAuthTokens();
    await chrome.storage.local.remove(USER_STORAGE_KEY);
    await chrome.runtime.sendMessage({ type: "simplyBlocksSignedOut" }).catch((error) => {
        console.warn("Simply Blocks tab group cleanup failed:", error);
    });
}

async function removeCachedToken(token) {
    if (!token) {
        return;
    }

    await chrome.identity.removeCachedAuthToken({
        token
    });
}
