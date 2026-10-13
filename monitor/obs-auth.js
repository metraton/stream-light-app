const encoder = new TextEncoder();

async function sha256Base64(text) {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** Returns the obs-websocket v5 `authentication` string for the salt and challenge of a Hello message. */
export async function computeAuthentication(password, salt, challenge) {
    const secret = await sha256Base64(password + salt);
    return sha256Base64(secret + challenge);
}
