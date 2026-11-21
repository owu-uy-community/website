import { randomInt } from "node:crypto";

/** Crockford's base32: no I, L, O or U, so a code read aloud or typed at the door can't be misread */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ticket's code: 10 characters, 50 bits, what the QR holds and the door types. */
export const ticketCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
