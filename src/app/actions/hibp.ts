"use server";

import crypto from "crypto";

export async function checkPasswordPwned(password: string) {
    const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) {
        throw new Error("Failed to contact Pwned Passwords API");
    }

    const text = await res.text();
    const lines = text.split("\n");

    let foundCount = 0;
    for (const line of lines) {
        const [hashSuffix, count] = line.split(":");
        if (hashSuffix.trim() === suffix) {
            foundCount = parseInt(count.trim(), 10) || 0;
            break;
        }
    }

    return {
        isPwned: foundCount > 0,
        count: foundCount
    };
}
