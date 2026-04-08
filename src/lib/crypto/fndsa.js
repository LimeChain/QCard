"use strict";

// -------------------------------------------------------------------------
// Public API.

/**
 * An FN-DSA key pair.
 * @typedef {Object} FNDSAKeyPair
 * @property {Uint8Array} sign_key The signing key (private).
 * @property {Uint8Array} verify_key The verifying key (public).
 */

/**
 * Generates a new {@link FNDSAKeyPair} with the specified degree.
 *
 * Key pair generation is somewhat expensive, and thus should be
 * performed in a worker thread rather than the GUI thread (for browser
 * applications).
 *
 * @param {number} logn - logarithmic degree of the key; 9 for FN-DSA-512,
 *     10 for FN-DSA-1024
 * @throws if {@link logn} is not 9 or 10
 * @returns {FNDSAKeyPair} the generated key pair
 */
export function keygen(logn) {
    if (logn !== 9 && logn !== 10) {
        throw new Error("invalid log(degree) (must be 9 or 10)");
    }
    return core.keygen(logn);
}

/**
 * Sign some data.
 *
 * The [context]({@link ctx}) string ensures domain separation; it is
 * supposed to be something like the application name. It is not secret.
 * If a string is provided, then it is encoded into bytes (UTF-8). The
 * length of that value, in bytes, must be at most 255 bytes.
 *
 * If the message to sign is provided "as is" in [hv]({@link hv}), then
 * [id]({@link id}) should be equal to the [ID_RAW]({@link ID_RAW})
 * constant. In that case, [hv]({@link hv}) can be either a
 * {@link Uint8Array} (the bytes to sign) or a string; if
 * [hv]({@link hv}) is a string, then it is first encoded to bytes (with
 * UTF-8 conventions). Otherwise, the message is pre-hashed by the
 * caller: [hv]({@link hv}) is the hash value (a {@link Uint8Array}
 * instance) and [id]({@link id}) must be the ASN.1 DER-encoded OID that
 * identifies the hash function. The [ID_*]({@link ID_RAW}) constants
 * are provided for the "classic" hash functions (SHA-2 and SHA-3
 * families).
 *
 * @param {Uint8Array} sk - the signing key, from {@link FNDSAKeyPair.sign_key}
 * @param {(Uint8Array|string)} ctx - the context string
 * @param {Uint8Array} id - pre-hashing identifier
 * @param {(Uint8Array|string)} hv - the (pre-hashed) message
 * @returns {Uint8Array} the new signature
 */
export function sign(sk, ctx, id, hv) {
    if (typeof ctx === "string") {
        ctx = new TextEncoder().encode(ctx);
    }
    if (ctx.length > 255) {
        throw new Error('context string is too long (max 255 bytes)');
    }
    if (typeof hv === "string") {
        if (id.length == 0 || (id.length == 1 && id[0] == 0)) {
            hv = new TextEncoder().encode(hv);
        } else {
            throw new Error('pre-hashed message must be provided as bytes');
        }
    }
    if (sk.length === 0 || (sk[0] !== 0x59 && sk[0] !== 0x5A)) {
        throw new Error('invalid signing key');
    }
    return core.sign(sk, ctx, id, hv);
}

/**
 * Verify a signature.
 *
 * The [context]({@link ctx}) string ensures domain separation; it is
 * supposed to be something like the application name. It is not secret.
 * If a string is provided, then it is encoded into bytes (UTF-8). The
 * length of that value, in bytes, must be at most 255 bytes.
 *
 * If the message to sign is provided "as is" in [hv]({@link hv}), then
 * [id]({@link id}) should be equal to the [ID_RAW]({@link ID_RAW})
 * constant. In that case, [hv]({@link hv}) can be either a
 * {@link Uint8Array} (the bytes to sign) or a string; if
 * [hv]({@link hv}) is a string, then it is first encoded to bytes (with
 * UTF-8 conventions). Otherwise, the message is pre-hashed by the
 * caller: [hv]({@link hv}) is the hash value (a {@link Uint8Array}
 * instance) and [id]({@link id}) must be the ASN.1 DER-encoded OID that
 * identifies the hash function. The [ID_*]({@link ID_RAW}) constants
 * are provided for the "classic" hash functions (SHA-2 and SHA-3
 * families).
 *
 * @param {Uint8Array} sig - the signature
 * @param {Uint8Array} vk - the verifying key, from {@link FNDSAKeyPair.verify_key}
 * @param {(Uint8Array|string)} ctx - the context string
 * @param {Uint8Array} id - pre-hashing identifier
 * @param {(Uint8Array|string)} hv - the (pre-hashed) message
 *
 * @returns {boolean} true if the signature is valid, false otherwise.
 * In particular, false is returned in all of the following cases:
 * - Context string length (in bytes) is greater than 255.
 * - Verifying key cannot be decoded or has an unsupported degree
 *   (supported degrees are 512 and 1024).
 * - Pre-hashed value is provided as a string instead of Uint8Array (hv
 *   can be a string only if no pre-hashing is used, i.e. id is ID_RAW).
 * - Signature cannot be decoded.
 * - The signature verification algorithm reports a failure.
 */
export function verify(sig, vk, ctx, id, hv) {
    if (typeof ctx === "string") {
        ctx = new TextEncoder().encode(ctx);
    }
    if (ctx.length > 255) {
        return false;
    }
    if (typeof hv === "string") {
        if (id.length == 0 || (id.length == 1 && id[0] == 0)) {
            hv = new TextEncoder().encode(hv);
        } else {
            return false;
        }
    }
    if (vk.length === 0 || (vk[0] !== 0x09 && vk[0] !== 0x0A)) {
        return false;
    }
    return core.verify(sig, vk, ctx, id, hv);
}

// Hash function identifier: none (raw message, not pre-hashed).
export const ID_RAW = new Uint8Array([0x00]);

// Hash function identifier: SHA-256.
export const ID_SHA256 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01 ]);

// Hash function identifier: SHA-384.
export const ID_SHA384 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02 ]);

// Hash function identifier: SHA-512.
export const ID_SHA512 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03 ]);

// Hash function identifier: SHA-512-256.
export const ID_SHA512_256 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x06 ]);

// Hash function identifier: SHA3-256.
export const ID_SHA3_256 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x08 ]);

// Hash function identifier: SHA3-384.
export const ID_SHA3_384 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x09 ]);

// Hash function identifier: SHA3-512.
export const ID_SHA3_512 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x0A ]);

// Hash function identifier: SHAKE128.
export const ID_SHAKE128 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x0B ]);

// Hash function identifier: SHAKE256.
export const ID_SHAKE256 = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x0C ]);

// -------------------------------------------------------------------------
// SHAKE
//
// SHAKE is a XOF (eXtensible Output Function). It is initially in input
// state; data can be injected into it. Then, the engine can be flipped
// to output state, and bytes extracted from it. Input and output sizes
// are unbounded. The caller is responsible for tracking whether the
// engine is in input or output state.
class SHAKE {
    // Create a SHAKE instance. The new instance is ready to receive
    // some input data (input state).
    // sz: 128 for SHAKE128, 256 for SHAKE256.
    constructor(sz) {
        this.buf = new Uint8Array(200);
        this.ptr = 0;
        this.rate = 200 - (sz >>> 2);
    }

    // Inject some data. The engine must be in input state.
    // data: Uint8Array or string (string input is encoded with UTF-8).
    inject(data) {
        if (typeof data === "string") {
            data = new TextEncoder().encode(data);
        }
        let len = data.length;
        let ptr = this.ptr;
        for (let j = 0; j < len; j ++) {
            this.buf[ptr ++] ^= data[j];
            if (ptr === this.rate) {
                this.keccak_f();
                ptr = 0;
            }
        }
        this.ptr = ptr;
    }

    // Inject one byte value. Engine must be in input state.
    // x: number, converted to integer, low 8 bits are the byte value.
    inject_u8(x) {
        let ptr = this.ptr;
        if (ptr === this.rate) {
            this.keccak_f();
            ptr = 0;
        }
        this.buf[ptr ++] ^= x;
        this.ptr = ptr;
    }

    // Inject a 32-bit value. Engine must be in input state. This is
    // equivalent to encoding the value into four bytes (little-endian
    // convention) then injecting them.
    // x: number, converted to integer, low 32 bits are injected.
    inject_u32(x) {
        for (let i = 0; i < 4; i ++) {
            this.inject_u8(x & 0xFF);
            x >>>= 8;
        }
    }

    // Flip this engine from input state to output state. The engine must
    // initially be in input state.
    flip() {
        let ptr = this.ptr;
        this.buf[ptr] ^= 0x1F;
        this.buf[this.rate - 1] ^= 0x80;
        this.ptr = this.rate;
    }

    // Extract bytes. Engine must be in output state. The provided buffer
    // is filled with the next output bytes from the engine.
    // dst: destination buffer (Uint8Array).
    extract(dst) {
        let buf = this.buf;
        let ptr = this.ptr;
        let rate = this.rate;
        for (let i = 0; i < dst.length; i ++) {
            if (ptr === rate) {
                this.keccak_f();
                ptr = 0;
            }
            dst[i] = buf[ptr ++];
        }
        this.ptr = ptr;
    }

    // Extract one byte. Engine must be in output state. The next byte
    // is returned as an integer in the 0 to 255 range.
    extract_u8() {
        let ptr = this.ptr;
        if (ptr === this.rate) {
            this.keccak_f();
            ptr = 0;
        }
        let x = this.buf[ptr ++];
        this.ptr = ptr;
        return x;
    }

    // Extract a 16-bit value. The next two bytes are extracted, and
    // interpreted as an integer in the 0 to 65535 range (little-endian
    // convention). Engine must be in output state.
    extract_u16() {
        let x0 = this.extract_u8();
        let x1 = this.extract_u8();
        return x0 | (x1 << 8);
    }

    // Extract a 32-bit value. The next four bytes are extracted, and
    // interpreted as an integer in the 0 to 4294967295 range (little-endian
    // convention). Engine must be in output state.
    extract_u32() {
        let x0 = this.extract_u8();
        let x1 = this.extract_u8();
        let x2 = this.extract_u8();
        let x3 = this.extract_u8();
        return x0 | (x1 << 8) | (x2 << 16) | (x3 << 24);
    }

    // Reset the engine. The engine is restored to its initialization
    // value, and into input state.
    reset() {
        this.buf.fill(0);
        this.ptr = 0;
    }

    // Split even/odd-indexed bits in a byte.
    static splitb(x) {
        x = (x & 0x99) | ((x & 0x22) << 1) | ((x >>> 1) & 0x22);
        x = (x & 0xC3) | ((x & 0x0C) << 2) | ((x >>> 2) & 0x0C);
        return x;
    }

    // Split even/odd-indexed bits from two bytes into a 16-bit value.
    static mergeb(x0, x1) {
        let x = (x0 & 0x0F) | ((x1 & 0x0F) << 4) | ((x0 & 0xF0) << 4) | ((x1 & 0xF0) << 8);
        x = (x & 0xC3C3) | ((x & 0x0C0C) << 2) | ((x >>> 2) & 0x0C0C);
        x = (x & 0x9999) | ((x & 0x2222) << 1) | ((x >>> 1) & 0x2222);
        return x;
    }

    // Left-rotation of a 32-bit value by n bits (n = 0 to 31).
    static rotl(x, n) {
        if (n === 0) {
            return x;
        }
        return (x << n) | (x >>> (32 - n));
    }

    static RC = [
        0x00000001, 0x00000000, 0x00000000, 0x00000089,
        0x00000000, 0x8000008B, 0x00000000, 0x80008080,
        0x00000001, 0x0000008B, 0x00000001, 0x00008000,
        0x00000001, 0x80008088, 0x00000001, 0x80000082,
        0x00000000, 0x0000000B, 0x00000000, 0x0000000A,
        0x00000001, 0x00008082, 0x00000000, 0x00008003,
        0x00000001, 0x0000808B, 0x00000001, 0x8000000B,
        0x00000001, 0x8000008A, 0x00000001, 0x80000081,
        0x00000000, 0x80000081, 0x00000000, 0x80000008,
        0x00000000, 0x00000083, 0x00000000, 0x80008003,
        0x00000001, 0x80008088, 0x00000000, 0x80000088,
        0x00000001, 0x00008000, 0x00000000, 0x80008082 ];
    static rp_rlc = [
         1,  3,  6, 10, 15, 21, 28, 36, 45, 55,  2, 14,
        27, 41, 56,  8, 25, 43, 62, 18, 39, 61, 20, 44 ];
    static rp_next = [
        10,  7, 11, 17, 18,  3,  5, 16,  8, 21, 24,  4,
        15, 23, 19, 13, 12,  2, 20, 14, 22,  9,  6,  1 ];
    keccak_f() {
        // Split each 64-bit state word into even-indexed and odd-indexed
        // bits. This yields 50 32-bit words.
        let Ae = new Uint32Array(25);
        let Ao = new Uint32Array(25);
        for (let i = 0; i < 25; i ++) {
            let w0 = 0;
            let w1 = 0;
            for (let j = 0; j < 8; j ++) {
                let x = SHAKE.splitb(this.buf[8 * i + j]);
                w0 |= (x & 0x0F) << (4 * j);
                w1 |= (x >>> 4) << (4 * j);
            }
            Ae[i] = w0;
            Ao[i] = w1;
        }

        let Ce = new Uint32Array(5);
        let Co = new Uint32Array(5);

        for (let r = 0; r < 24; r ++) {

            // Theta
            for (let x = 0; x < 5; x ++) {
                Ce[x] = Ae[x] ^ Ae[x + 5] ^ Ae[x + 10] ^ Ae[x + 15] ^ Ae[x + 20];
                Co[x] = Ao[x] ^ Ao[x + 5] ^ Ao[x + 10] ^ Ao[x + 15] ^ Ao[x + 20];
            }
            for (let x = 0; x < 5; x ++) {
                let xm1 = (x === 0) ? 4 : (x - 1);
                let xp1 = (x === 4) ? 0 : (x + 1);
                let te = Ce[xm1] ^ SHAKE.rotl(Co[xp1], 1);
                let to = Co[xm1] ^ Ce[xp1];
                for (let y = 0; y < 5; y ++) {
                    Ae[x + 5 * y] ^= te;
                    Ao[x + 5 * y] ^= to;
                }
            }
 
            // Rho and Pi
            let te = Ae[1], to = Ao[1];
            for (let i = 0; i < 24; i ++) {
                let j = SHAKE.rp_next[i];
                let we = Ae[j], wo = Ao[j];
                let n = SHAKE.rp_rlc[i];
                if ((n & 1) === 0) {
                    Ae[j] = SHAKE.rotl(te, n >>> 1);
                    Ao[j] = SHAKE.rotl(to, n >>> 1);
                } else {
                    Ae[j] = SHAKE.rotl(to, (n >>> 1) + 1);
                    Ao[j] = SHAKE.rotl(te, n >>> 1);
                }
                te = we;
                to = wo;
            }

            // Xhi
            for (let y = 0; y < 5; y ++) {
                for (let x = 0; x < 5; x ++) {
                    Ce[x] = Ae[x + 5 * y];
                    Co[x] = Ao[x + 5 * y];
                }
                for (let x = 0; x < 5; x ++) {
                    Ae[x + 5 * y] ^= (~Ce[(x + 1) % 5]) & Ce[(x + 2) % 5];
                    Ao[x + 5 * y] ^= (~Co[(x + 1) % 5]) & Co[(x + 2) % 5];
                }
            }

            // Iota
            Ae[0] ^= SHAKE.RC[2 * r + 0];
            Ao[0] ^= SHAKE.RC[2 * r + 1];
        }

        // Merge all bits back into the 64-bit state words.
        for (let i = 0; i < 25; i ++) {
            let w0 = Ae[i];
            let w1 = Ao[i];
            for (let j = 0; j < 4; j ++) {
                let x = SHAKE.mergeb(w0 & 0xFF, w1 & 0xFF);
                this.buf[8 * i + 2 * j + 0] = x & 0xFF;
                this.buf[8 * i + 2 * j + 1] = x >>> 8;
                w0 >>>= 8;
                w1 >>>= 8;
            }
        }
    }
}

// -------------------------------------------------------------------------
// Encoding/decoding functions.
class codec {

    // Encode f (Int8Array) into d (Uint8Array), 'nbits' bits per value.
    // Returns the encoded size (in bytes).
    static trim_i8_encode(logn, f, nbits, d) {
        let n = 1 << logn;
        if (nbits === 8) {
            for (let i = 0; i < n; i ++) {
                d[i] = f[i] & 0xFF;
            }
            return n;
        } else {
            let j = 0;
            let acc = 0;
            let acc_len = 0;
            let mask = (1 << nbits) - 1;
            for (let i = 0; i < n; i ++) {
                acc = (acc << nbits) | (f[i] & mask);
                acc_len += nbits;
                if (acc_len >= 8) {
                    acc_len -= 8;
                    d[j ++] = (acc >>> acc_len) & 0xFF;
                }
            }
            return j;
        }
    }

    // Decode d (Uint8Array) into f (Int8Array), 'nbits' bits per value.
    // Returns the number of used bytes, or 0 on error. An error is
    // reported if any value is equal to -2^(nbits-1).
    static trim_i8_decode(logn, d, f, nbits) {
        let needed = (nbits << logn) >>> 3;
        let j = 0;
        let acc = 0;
        let acc_len = 0;
        let mask1 = (1 << nbits) - 1;
        let mask2 = 1 << (nbits - 1);
        for (let i = 0; i < needed; i ++) {
            acc = (acc << 8) | d[i];
            acc_len += 8;
            while (acc_len >= nbits) {
                acc_len -= nbits;
                let w = (acc >>> acc_len) & mask1;
                w |= -(w & mask2);
                if (w === -mask2) {
                    return 0;
                }
                f[j ++] = w;
            }
        }
        return needed;
    }

    // Encode h (Uint16Array) into d (Uint8Array), 14 bits per value.
    // Returns the encoded size (in bytes).
    static mqpoly_encode(logn, h, d) {
        let n = 1 << logn;
        let j = 0;
        for (let i = 0; i < n; i += 4) {
            let h0 = h[i + 0];
            let h1 = h[i + 1];
            let h2 = h[i + 2];
            let h3 = h[i + 3];
            d[j + 0] = (h0 >>> 6) & 0xFF;
            d[j + 1] = ((h0 << 2) | (h1 >>> 12)) & 0xFF;
            d[j + 2] = (h1 >>> 4) & 0xFF;
            d[j + 3] = ((h1 << 4) | (h2 >>> 10)) & 0xFF;
            d[j + 4] = (h2 >>> 2) & 0xFF;
            d[j + 5] = ((h2 << 6) | (h3 >>> 8)) & 0xFF;
            d[j + 6] = h3 & 0xFF;
            j += 7;
        }
        return j;
    }

    // Decode d (Uint8Array) into h (Uint16Array), 14 bits per value.
    // Returns the number of used bytes, or 0 on error. An error is
    // reported if any value is outside of [0, 12288].
    static mqpoly_decode(logn, d, h) {
        let n = 1 << logn;
        let j = 0;
        let ov = -1;
        for (let i = 0; i < n; i += 4) {
            let d0 = d[j + 0];
            let d1 = d[j + 1];
            let d2 = d[j + 2];
            let d3 = d[j + 3];
            let d4 = d[j + 4];
            let d5 = d[j + 5];
            let d6 = d[j + 6];
            j += 7;
            let h0 = (d0 << 6) | (d1 >>> 2);
            let h1 = ((d1 << 12) | (d2 << 4) | (d3 >>> 4)) & 0x3FFF;
            let h2 = ((d3 << 10) | (d4 << 2) | (d5 >>> 6)) & 0x3FFF;
            let h3 = ((d5 << 8) | d6) & 0x3FFF;
            h[i + 0] = h0;
            h[i + 1] = h1;
            h[i + 2] = h2;
            h[i + 3] = h3;
            ov &= h0 - mq.Q;
            ov &= h1 - mq.Q;
            ov &= h2 - mq.Q;
            ov &= h3 - mq.Q;
        }
        if ((ov >>> 16) === 0) {
            return 0;
        } else {
            return j;
        }
    }

    // Encode s (Int16Array) into d, writing out exactly dlen bytes.
    // Compressed format (Golomb-Rice) is used, with zero padding up to
    // dlen bytes.
    // Returns dlen on success, 0 on error. An error is reported if any
    // of the source values is outside [-2047,+2047] or if more than
    // dlen bytes would be needed.
    static comp_encode(logn, s, d, dlen) {
        let n = 1 << logn;
        let acc = 0;
        let acc_len = 0;
        let j = 0;
        for (let i = 0; i < n; i ++) {
            let x = s[i];
            if (x < -2047 || x > +2047) {
                return 0;
            }
            let sw = x >> 16;
            let w = (x ^ sw) - sw;
            acc = (acc << 8) | (sw & 0x80) | (w & 0x7F);
            acc_len += 8;
            let wh = (w >>> 7) + 1;
            acc = (acc << wh) | 1;
            acc_len += wh;
            while (acc_len >= 8) {
                acc_len -= 8;
                if (j >= dlen) {
                    return false;
                }
                d[j ++] = (acc >>> acc_len) & 0xFF;
            }
        }
        if (acc_len > 0) {
            if (j >= dlen) {
                return false;
            }
            d[j ++] = (acc << (8 - acc_len)) & 0xFF;
        }
        while (j < dlen) {
            d[j ++] = 0;
        }
        return true;
    }

    // Decode the first dlen bytes of d (Uint8Array) into s (Int16Array)
    // using the compressed format (Golomb-Rice).
    // Returns dlen on success, 0 on error. An error is reported  on
    // invalid encoding:
    //   A value would be outside of [-2047,+2047].
    //   A "minus zero" encoding is encountered.
    //   Not enough input bytes are available for the 2^logn values.
    //   Padding bits/bytes up to dlen are not all zeros.
    static comp_decode(logn, d, dlen, s) {
        let n = 1 << logn;
        let acc = 0;
        let acc_len = 0;
        let j = 0;
        for (let i = 0; i < n; i ++) {
            if (j >= dlen) {
                return false;
            }
            acc = (acc << 8) | d[j ++];
            let m = acc >>> acc_len;
            let t = (m >>> 7) & 1;
            m &= 0x7F;
            for (;;) {
                if (acc_len === 0) {
                    if (j >= dlen) {
                        return false;
                    }
                    acc = (acc << 8) | d[j ++];
                    acc_len = 8;
                }
                acc_len --;
                if (((acc >>> acc_len) & 1) !== 0) {
                    break;
                }
                m += 0x80;
                if (m > 2047) {
                    return false;
                }
            }
            if (m === 0 && t !== 0) {
                return false;
            }
            s[i] = (m ^ -t) + t;
        }
        if (acc_len > 0) {
            if ((acc & ((1 << acc_len) - 1)) !== 0) {
                return false;
            }
        }
        while (j < dlen) {
            if (d[j ++] !== 0) {
                return false;
            }
        }
        return true;
    }
}

// -------------------------------------------------------------------------
// Computations modulo q = 12289.
//
// Polynomials use Uint16Array with three encoding formats:
//   ext: values are in [0, q-1]
//   int: internal format, not part of the API
//   ntt: internal format, converted to NTT
class mq {
    // Values are held as integers in the [1,q] range (i.e. zero is
    // represented by q, not by 0). Montgomery multiplication uses
    // R = 2^32, i.e. given x and y, it computes (x*y)/2^32 mod q.
    static Q = 12289;
    static R = 10952;      // 2^32 mod q
    static R2 = 5664;      // 2^64 mod q
    static Q1Ilo = 12287;  // Q1I = -1/q mod 2^32 (split into 16-bit words)
    static Q1Ihi = 63232;

    static rev10(k) {
        let j = (k >>> 5) | ((k & 0x1F) << 5);
        let j0 = j & 0x021;
        let j1 = j & 0x042;
        let j2 = j & 0x084;
        let j3 = j & 0x108;
        let j4 = j & 0x210;
        return (j4 >>> 4) | (j3 >>> 2) | j2 | (j1 << 2) | (j0 << 4);
    }

    // Addition modulo q.
    static add(x, y) {
        x = mq.Q - (x + y);
        x += mq.Q & (x >>> 16);
        return mq.Q - x;
    }

    // Subtraction modulo q.
    static sub(x, y) {
        y -= x;
        y += mq.Q & (y >>> 16);
        return mq.Q - y;
    }

    // Halving modulo q.
    static half(x) {
        x += mq.Q & -(x & 1);
        return x >>> 1;
    }

    // Montgomery reduction: given x, returns x/2^32 mod q. This function
    // can use values x in [1, 3489673216].
    static mred(x) {
        // Multiply by -1/q mod 2^32 and keep only the high 16 bits.
        let x0 = x & 0xFFFF;
        let x1 = (x >>> 16);
        let y0 = (x0 * mq.Q1Ilo) >>> 16;
        let y1 = (x0 * mq.Q1Ihi) & 0xFFFF;
        let y2 = (x1 * mq.Q1Ilo) & 0xFFFF;
        x = (y0 + y1 + y2) & 0xFFFF;
        // Multiply by q and keep only the high 16 bits, then add 1.
        x *= mq.Q;
        return (x >>> 16) + 1;
    }

    // Montgomery multiplication: get (x*y)/2^32 mod q (in [1, q]).
    static mmul(x, y) {
        return mq.mred(x * y);
    }

    // Division modulo q.
    static div(x, y) {
        y = mq.mmul(y, mq.R2);
        let y2 = mq.mmul(y, y);
        let y3 = mq.mmul(y2, y);
        let y5 = mq.mmul(y3, y2);
        let y10 = mq.mmul(y5, y5);
        let y20 = mq.mmul(y10, y10);
        let y40 = mq.mmul(y20, y20);
        let y80 = mq.mmul(y40, y40);
        let y160 = mq.mmul(y80, y80);
        let y163 = mq.mmul(y160, y3);
        let y323 = mq.mmul(y163, y160);
        let y646 = mq.mmul(y323, y323);
        let y1292 = mq.mmul(y646, y646);
        let y1455 = mq.mmul(y1292, y163);
        let y2910 = mq.mmul(y1455, y1455);
        let y5820 = mq.mmul(y2910, y2910);
        let y6143 = mq.mmul(y5820, y323);
        let y12286 = mq.mmul(y6143, y6143);
        let iy = mq.mmul(y12286, y);
        return mq.mmul(x, iy);
    }

    // Tables for NTT.
    static GM = [];
    static IGM = [];
    static {
        let n = 1 << 10;
        let g = 7;              // primitive 2048-th root of 1 modulo q
        let ig = mq.div(1, g);  // 1/g mod q
        g = mq.mmul(g, mq.R2);
        ig = mq.mmul(ig, mq.R2);
        let x1 = mq.R;
        let x2 = mq.half(x1);
        for (let i = 0; i < n; i ++) {
            let j = mq.rev10(i);
            mq.GM[j] = x1;
            mq.IGM[j] = x2;
            x1 = mq.mmul(x1, g);
            x2 = mq.mmul(x2, ig);
        }
    }

    // Convert from f (Int8Array) to d (Uint16Array, mod q, int format).
    static poly_small_to_int(logn, f, d) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            let x = -f[i];
            d[i] = mq.Q - (x + (mq.Q & (x >>> 16)));
        }
    }

    // Convert from f (Uint16Array, with signed 16-bit interpretation)
    // to d (Uint16Array, mod q, int format).
    static poly_signed_to_int(logn, d) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            let x = d[i];
            x |= -(x & 0x8000);
            x = -x;
            d[i] = mq.Q - (x + (mq.Q & (x >>> 16)));
        }
    }

    // Convert from d (Uint16Array, mod q, int format) to f (Int8Array).
    // Values are normalized to [-q/2,+q/2]. Returned value is true on
    // success, false on error; an error is reported if any of the values
    // is outside [-127,+127].
    static poly_int_to_small(logn, d, f) {
        let n = 1 << logn;
        let ov = 0;
        for (let i = 0; i < n; i ++) {
            let x = mq.add(d[i], 128);
            ov |= x;
            f[i] = (x & 0xFF) - 128;
        }
        return (ov >>> 8) === 0;
    }

    // Convert d (Uint16Array) from ext to int format.
    // Conversion is done in-place.
    static poly_ext_to_int(logn, d) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            let x = d[i];
            x += mq.Q & ((x - 1) >>> 16);
            d[i] = x;
        }
    }

    // Convert d (Uint16Array) from int to ext format.
    // Conversion is done in-place.
    static poly_int_to_ext(logn, d) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            let x = d[i] - mq.Q;
            x += mq.Q & (x >>> 16);
            d[i] = x;
        }
    }

    // Convert d (Uint16Array) from int to ntt format.
    // Conversion is done in-place.
    static poly_int_to_ntt(logn, f) {
        let t = 1 << logn;
        for (let lm = 0; lm < logn; lm ++) {
            let m = 1 << lm;
            let ht = t >>> 1;
            let j0 = 0;
            for (let i = 0; i < m; i ++) {
                let s = mq.GM[i + m];
                for (let j = 0; j < ht; j ++) {
                    let j1 = j0 + j;
                    let j2 = j1 + ht;
                    let x1 = f[j1];
                    let x2 = mq.mmul(f[j2], s);
                    f[j1] = mq.add(x1, x2);
                    f[j2] = mq.sub(x1, x2);
                }
                j0 += t;
            }
            t = ht;
        }
    }

    // Convert d (Uint16Array) from ntt to int format.
    // Conversion is done in-place.
    static poly_ntt_to_int(logn, f) {
        let t = 1;
        for (let lm = 0; lm < logn; lm ++) {
            let hm = 1 << (logn - 1 - lm);
            let dt = t << 1;
            let j0 = 0;
            for (let i = 0; i < hm; i ++) {
                let s = mq.IGM[i + hm];
                for (let j = 0; j < t; j ++) {
                    let j1 = j0 + j;
                    let j2 = j1 + t;
                    let x1 = f[j1];
                    let x2 = f[j2];
                    f[j1] = mq.half(mq.add(x1, x2));
                    f[j2] = mq.mmul(mq.sub(x1, x2), s);
                }
                j0 += dt;
            }
            t = dt;
        }
    }

    // Multiply polynomial a by polynomial b. a is modified, b is unmodified.
    // Both polynomials must be in ntt format.
    static poly_mul_ntt(logn, a, b) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] = mq.mmul(mq.mmul(a[i], b[i]), mq.R2);
        }
    }

    // Divide polynomial a by polynomial b. a is modified, b is unmodified.
    // Both polynomials must be in ntt format. Returned value is true on
    // success, or false on error. An error is reported if the divisor (b)
    // is not invertible modulo x^n+1 and modulo q.
    static poly_div_ntt(logn, a, b) {
        let n = 1 << logn;
        let r = 0xFFFFFFFF;
        for (let i = 0; i < n; i ++) {
            let x = b[i];
            r &= x - mq.Q;
            a[i] = mq.div(a[i], x);
        }
        return (r >>> 16) !== 0;
    }

    // Subtract polynomial b from polynomial a. a is modified, b is not
    // modified. Both polynomial must be in int format, or both most be
    // in ntt format.
    static poly_sub(logn, a, b) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] = mq.sub(a[i], b[i]);
        }
    }

    // Check whether polynomial a is invertible modulo x^n+1 and modulo q.
    // Polynomial must be in ntt format. Returns true if invertible,
    // false otherwise.
    static poly_is_invertible_ntt(logn, a) {
        let n = 1 << logn;
        let r = 0xFFFFFFFF;
        for (let i = 0; i < n; i ++) {
            let x = a[i];
            r &= x - mq.Q;
        }
        return (r >>> 16) !== 0;
    }

    // Compute the squared norm of polynomial a. Polynomial must be in
    // external format. The squared norm computation implicitly normalizes
    // coefficients to [-q/2,+q/2]. The returned value is saturated at
    // 2^31-1 (i.e. values greater than 2^31-1 are replaced with 2^31-1).
    static poly_sqnorm_ext(logn, a) {
        let n = 1 << logn;
        let s = 0;
        let sat = 0;
        for (let i = 0; i < n; i ++) {
            let x = a[i];
            x -= mq.Q & ((((mq.Q - 1) >>> 1) - x) >>> 16);
            s = (s + x * x) | 0;
            sat |= s;
            s &= 0x7FFFFFFF;
        }
        s |= (-(sat >>> 31)) >>> 1;
        return s;
    }

    // Compute the squared norm of polynomial a (Uint16Array, with signed
    // 16-bit interpretation). All source values must be in [-2047,+2047]
    // (when interpreted as signed).
    static poly_sqnorm_signed(logn, a) {
        let n = 1 << logn;
        let s = 0;
        for (let i = 0; i < n; i ++) {
            let x = a[i];
            x |= -(x & 0x8000);
            s += x * x;
        }
        return s;
    }

    static SQBETA = [
        0,        // unused
        101498,
        208714,
        428865,
        892039,
        1852696,
        3842630,
        7959734,
        16468416,
        34034726,
        70265242 ];
    // Get maximum allowed squared norm for a valid signature.
    static poly_sqnorm_is_acceptable(logn, norm) {
        return norm <= mq.SQBETA[logn];
    }
}

// -------------------------------------------------------------------------
// Computations with floating-point real polynomials.
//
// Polynomials use the Float64Array type. Each polynomial is either in
// normal or FFT representation. In FFT representation, n/2 complex
// coefficients are included: the real and imaginary parts of coefficient j
// are at indices j and j + n/2, respectively.
//
// The Hermitian adjoint of polynomial f is adj(f), with:
//   adj(f) = f_0 - sum_{i=1}^{n-1} f_i x^(n-i)
// The FFT representation of adj(f) is obtained from the FFT representation
// of f by negating the imaginary parts of the coefficients. A self-adjoint
// polynomial f is a polynomial such that f = adj(f); all its coefficients
// in FFT representation are real (which means that values at indices n/2
// to n-1 are zero).
class fpoly {
    static INV_Q = 1.0 / 12289.0;
    static MINUS_INV_Q = -fpoly.INV_Q;
    static GM = new Float64Array(2048);
    static {
        fpoly.GM[0] = 0.0;
        fpoly.GM[1] = 0.0;
        fpoly.GM[2] = -0.0;
        fpoly.GM[3] = 1.0;
        for (let k = 2; k < 1024; k ++) {
            let j = mq.rev10(k);
            fpoly.GM[2 * k + 0] = Math.cos((j * Math.PI) / 1024.0);
            fpoly.GM[2 * k + 1] = Math.sin((j * Math.PI) / 1024.0);
        }
    }

    // Convert from normal to FFT representation.
    static FFT(logn, f) {
        let hn = 1 << (logn - 1);
        let t = hn;
        for (let lm = 1; lm < logn; lm ++) {
            let m = 1 << lm;
            let hm = m >>> 1;
            let ht = t >>> 1;
            let j0 = 0;
            for (let i = 0; i < hm; i ++) {
                let s_re = fpoly.GM[((m + i) << 1) + 0];
                let s_im = fpoly.GM[((m + i) << 1) + 1];
                for (let j = 0; j < ht; j ++) {
                    let j1 = j0 + j;
                    let j2 = j1 + ht;
                    let x_re = f[j1];
                    let x_im = f[j1 + hn];
                    let y_re = f[j2];
                    let y_im = f[j2 + hn];
                    let z_re = y_re * s_re - y_im * s_im;
                    let z_im = y_re * s_im + y_im * s_re;
                    f[j1] = x_re + z_re;
                    f[j1 + hn] = x_im + z_im;
                    f[j2] = x_re - z_re;
                    f[j2 + hn] = x_im - z_im;
                }
                j0 += t;
            }
            t = ht;
        }
    }

    // Convert from FFT to normal representation.
    static iFFT(logn, f) {
        let n = 1 << logn;
        let hn = n >> 1;
        let t = 1;
        for (let lm = 1; lm < logn; lm ++) {
            let hm = 1 << (logn - lm);
            let dt = t << 1;
            let j0 = 0;
            for (let i = 0; i < (hm >>> 1); i ++) {
                let s_re = fpoly.GM[((hm + i) << 1) + 0];
                let s_im = -fpoly.GM[((hm + i) << 1) + 1];
                for (let j = 0; j < t; j ++) {
                    let j1 = j0 + j;
                    let j2 = j1 + t;
                    let x_re = f[j1];
                    let x_im = f[j1 + hn];
                    let y_re = f[j2];
                    let y_im = f[j2 + hn];
                    f[j1] = x_re + y_re;
                    f[j1 + hn] = x_im + y_im;
                    x_re -= y_re;
                    x_im -= y_im;
                    f[j2] = x_re * s_re - x_im * s_im;
                    f[j2 + hn] = x_re * s_im + x_im * s_re;
                }
                j0 += dt;
            }
            t = dt;
        }
        let cc = 1.0 / hn;
        for (let i = 0; i < n; i ++) {
            f[i] *= cc;
        }
    }

    // Set d (Float64Array) from f (Int8Array).
    static set_small(logn, d, f) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            d[i] = f[i];
        }
    }

    // Add polynomial b to a. The two polynomials must have the same
    // representation (normal or FFT).
    static add(logn, a, b) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] += b[i];
        }
    }

    // Subtract polynomial b from a. The two polynomials must have the same
    // representation (normal or FFT).
    static sub(logn, a, b) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] -= b[i];
        }
    }

    // Negate polynomial a. This words in both normal and FFT representations.
    static neg(logn, a) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] = -a[i];
        }
    }

    // Multiply polynomial a by polynomial b. Both must be in FFT
    // representation.
    static mul_fft(logn, a, b) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let a_re = a[i], a_im = a[i + hn];
            let b_re = b[i], b_im = b[i + hn];
            a[i] = a_re * b_re - a_im * b_im;
            a[i + hn] = a_re * b_im + a_im * b_re;
        }
    }

    // Replace polynomial a by its Hermitian adjoint. The polynomial must
    // be in FFT representation.
    static adj_fft(logn, a) {
        let n = 1 << logn;
        let hn = n >>> 1;
        for (let i = hn; i < n; i ++) {
            a[i] = -a[i];
        }
    }

    // Multiply polynomial a by polynomial b, assuming that b is
    // self-adjoint. Only the first n/2 elements of b are accessed.
    static mul_selfadj_fft(logn, a, b) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let x = b[i];
            a[i] *= x;
            a[i + hn] *= x;
        }
    }

    // Multiply polynomial a by real constant x. Works in both normal and
    // FFT representations.
    static mulconst(logn, a, x) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            a[i] *= x;
        }
    }

    // Set d to 1/(f*adj(f) + g*adj(g)). All polynomials are in FFT
    // representation. Since the result is self-adjoint, only the
    // first n/2 coefficients are set in d.
    static invnorm_fft(logn, d, f, g) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let x0 = f[i], x1 = f[i + hn];
            let y0 = g[i], y1 = g[i + hn];
            d[i] = 1.0 / (x0 * x0 + x1 * x1 + y0 * y0 + y1 * y1);
        }
    }

    // Set r to a*b + c*d. All polynomials are in FFT representation.
    static mul_mul_add(logn, r, a, b, c, d) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let a_re = a[i], a_im = a[i + hn];
            let b_re = b[i], b_im = b[i + hn];
            let c_re = c[i], c_im = c[i + hn];
            let d_re = d[i], d_im = d[i + hn];
            r[i] = (a_re * b_re - a_im * b_im) + (c_re * d_re - c_im * d_im);
            r[i + hn] = (a_re * b_im + a_im * b_re) + (c_re * d_im + c_im * d_re);
        }
    }

    // LDL decomposition of self-adjoint matrix G. The matrix is
    // G = [[g00, g01], [adj(g01), g11]]; g00 and g11 are self-adjoint
    // polynomials. Decomposition is G = L*D*adj(L), with:
    //    D = [[g00, 0], [0, d11]]
    //    L = [[1, 0], [l10, 1]]
    // The output polynomials l10 and d11 are written over g01 and g11,
    // respectively. g00 is unmodified. d11 is self-adjoint: only the
    // first n/2 coefficients are set. Similarly, only the first n/2
    // coefficients of g00 and g11 are read. All polynomials are in FFT
    // representation.
    static LDL_fft(logn, g00, g01, g11) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let g00_re = g00[i];
            let g01_re = g01[i], g01_im = g01[i + hn];
            let g11_re = g11[i];
            let inv_g00_re = 1.0 / g00_re;
            let mu_re = g01_re * inv_g00_re;
            let mu_im = g01_im * inv_g00_re;
            let zo_re = mu_re * g01_re + mu_im * g01_im;
            g11[i] = g11_re - zo_re;
            g01[i] = mu_re;
            g01[i + hn] = -mu_im;
        }
    }

    // Split operation: for polynomial f, return half-size polynomials
    // f0 and f1 such that f = f0(x^2) + x*f1(x^2). All polynomials are
    // in FFT representation.
    static split_fft(logn, f0, f1, f) {
        let hn = 1 << (logn - 1);
        let qn = hn >> 1;
        if (logn === 1) {
            f0[0] = f[0];
            f1[0] = f[hn];
        }
        for (let i = 0; i < qn; i ++) {
            let a_re = f[(i << 1) + 0], a_im = f[(i << 1) + 0 + hn];
            let b_re = f[(i << 1) + 1], b_im = f[(i << 1) + 1 + hn];
            let t_re = a_re + b_re;
            let t_im = a_im + b_im;
            let u_re = a_re - b_re;
            let u_im = a_im - b_im;
            f0[i] = t_re * 0.5;
            f0[i + qn] = t_im * 0.5;
            let s_re = fpoly.GM[((i + hn) << 1) + 0];
            let s_im = -fpoly.GM[((i + hn) << 1) + 1];
            f1[i] = (u_re * s_re - u_im * s_im) * 0.5;
            f1[i + qn] = (u_re * s_im + u_im * s_re) * 0.5;
        }
    }

    // Specialized version of split_fft() when f is self-adjoint. Only
    // the first n/2 elements of f are read. All n/2 elements of f0 and
    // f1 are set, even though f0 is self-adjoint (its elements n/4 to
    // n/2-1 are set to zero). f1 is, in general, not self-adjoint.
    static split_selfadj_fft(logn, f0, f1, f) {
        let hn = 1 << (logn - 1);
        let qn = hn >> 1;
        if (logn === 1) {
            f0[0] = f[0];
            f1[0] = 0.0;
        }
        for (let i = 0; i < qn; i ++) {
            let a_re = f[(i << 1) + 0];
            let b_re = f[(i << 1) + 1];
            let t_re = a_re + b_re;
            let u_re = a_re - b_re;
            f0[i] = t_re * 0.5;
            f0[i + qn] = 0.0;
            let s_re = fpoly.GM[((i + hn) << 1) + 0];
            let s_im = -fpoly.GM[((i + hn) << 1) + 1];
            u_re *= 0.5;
            f1[i] = u_re * s_re;
            f1[i + qn] = u_re * s_im;
        }
    }

    // Reverse operation of split_fft(): f0 and f1 (size n/2) are merged
    // into f (size n) such that f = f0(x^2) + x*f1(x^2). All polynomials
    // are in FFT representation.
    static merge_fft(logn, f, f0, f1) {
        let hn = 1 << (logn - 1);
        let qn = hn >> 1;
        if (logn === 1) {
            f[0] = f0[0];
            f[hn] = f1[0];
        }
        for (let i = 0; i < qn; i ++) {
            let a_re = f0[i], a_im = f0[i + qn];
            let b_re = f1[i], b_im = f1[i + qn];
            let s_re = fpoly.GM[((i + hn) << 1) + 0];
            let s_im = fpoly.GM[((i + hn) << 1) + 1];
            let c_re = b_re * s_re - b_im * s_im;
            let c_im = b_re * s_im + b_im * s_re;
            f[(i << 1) + 0] = a_re + c_re;
            f[(i << 1) + 1] = a_re - c_re;
            f[(i << 1) + 0 + hn] = a_im + c_im;
            f[(i << 1) + 1 + hn] = a_im - c_im;
        }
    }

    // Given matrix B = [[b00, b01], [b10, b11]], compute the Gram
    // matrix G = B*adj(B) = [[g00, g01], [g10, g11]], with:
    //    g00 = b00*adj(b00) + b01*adj(b01)
    //    g01 = b00*adj(b10) + b01*adj(b11)
    //    g10 = b10*adj(b00) + b11*adj(b01)
    //    g11 = b10*adj(b10) + b11*adj(b11)
    // g10 is not returned since it is equal to adj(g01). All polynomials
    // are in FFT representation.
    static gram_fft(logn, b00, b01, b10, b11, g00, g01, g11) {
        let hn = 1 << (logn - 1);
        for (let i = 0; i < hn; i ++) {
            let b00_re = b00[i], b00_im = b00[i + hn];
            let b01_re = b01[i], b01_im = b01[i + hn];
            let b10_re = b10[i], b10_im = b10[i + hn];
            let b11_re = b11[i], b11_im = b11[i + hn];

            // g00 = b00*adj(b00) + b01*adj(b01)
            let g00_re = (b00_re * b00_re + b00_im * b00_im) +
                (b01_re * b01_re) + (b01_im * b01_im);
            // g01 = b00*adj(b10) + b01*adj(b11)
            let u_re = b00_re * b10_re + b00_im * b10_im;
            let u_im = b00_im * b10_re - b00_re * b10_im;
            let v_re = b01_re * b11_re + b01_im * b11_im;
            let v_im = b01_im * b11_re - b01_re * b11_im;
            let g01_re = u_re + v_re;
            let g01_im = u_im + v_im;
            // g11 = b10*adj(b10) + b11*adj(b11)
            let g11_re = b10_re * b10_re + b10_im * b10_im +
                b11_re * b11_re + b11_im * b11_im;

            g00[i] = g00_re;
            g00[i + hn] = 0.0;
            g01[i] = g01_re;
            g01[i + hn] = g01_im;
            g11[i] = g11_re;
            g11[i + hn] = 0.0;
        }
    }

    // Given matrix B = [[b00, b01], [b10, b11]] and polynomial hm
    // (Uint16Array), compute the target vector [t0,t1] = (1/q)*B*[0,hm]
    // (with q = 12289). Only b01 and b11 are needed, which is why b00
    // and b10 are not part of the parameters. hm is in normal
    // representation (mod q, 'ext': values are in [0,q-1]); all other
    // polynomials are in FFT representation.
    static apply_basis(logn, t0, t1, b01, b11, hm) {
        let n = 1 << logn;
        for (let i = 0; i < n; i ++) {
            t0[i] = hm[i];
        }
        fpoly.FFT(logn, t0);
        t1.set(t0);
        fpoly.mul_fft(logn, t1, b01);
        fpoly.mulconst(logn, t1, fpoly.MINUS_INV_Q);
        fpoly.mul_fft(logn, t0, b11);
        fpoly.mulconst(logn, t0, fpoly.INV_Q);
    }
}

// -------------------------------------------------------------------------
// Polynomials with (big) integer coefficients.
//
// This is used in keygen.
class zpoly {
    // For polynomial a, taken modulo x^n + 1, we can split it into its
    // even-indexed and odd-indexed coefficients:
    //    a = a0(x^2) + x*a1(x^2)
    // with a0 and a1 being half-size (i.e. modulo x^(n/2)+1). Then the
    // Galois conjugate is:
    //    conj(a) = a0(x^2) - x*a1(x^2)
    // and the Galois norm is the half-size polynomial:
    //    gnorm(a) = a0^2 - x*a1^2
    // The following holds:
    //    gnorm(a)(x^2) = a*conj(a)

    // Set d to the Galois norm of polynomial a.
    static galois_norm(logn, d, a) {
        let n = 1 << logn;
        let hn = n >>> 1;
        for (let k = 0; k < n; k += 2) {
            let s = 0n;
            for (let i = 0; i <= k; i += 2) {
                let j = k - i;
                s += a[i] * a[j];
            }
            for (let i = k + 2; i < n; i += 2) {
                let j = k + n - i;
                s -= a[i] * a[j];
            }
            d[k >>> 1] = s;
        }
        for (let k = 0; k < n; k += 2) {
            let s = 0n;
            for (let i = 1; i < k; i += 2) {
                let j = k - i;
                s += a[i] * a[j];
            }
            for (let i = k + 1; i < n; i += 2) {
                let j = k + n - i;
                s -= a[i] * a[j];
            }
            d[k >>> 1] -= s;
        }
    }

    // d <- conj(a)*b(x^2)
    // conj(a) means negating odd-indexed coefficients.
    // b has half-degree.
    static mul_conj_hd(logn, d, a, b) {
        let n = 1 << logn;
        let hn = n >>> 1;
        for (let k = 0; k < n; k ++) {
            let s = 0n;
            for (let i = 0; i <= k; i += 2) {
                let j = k - i;
                s += b[i >>> 1] * a[j];
            }
            for (let i = k + 2 - (k & 1); i < n; i += 2) {
                let j = k + n - i;
                s -= b[i >>> 1] * a[j];
            }
            if ((k & 1) === 0) {
                d[k] = s;
            } else {
                d[k] = -s;
            }
        }
    }

    // Some precomputed powers of 2, to compute bit lengths.
    static pp2 = []
    static {
        for (let i = 0; i <= 4096; i += 32) {
            zpoly.pp2[i >>> 5] = 1n << BigInt(i);
        }
    }

    // Get size of x in bits, i.e. the smallest k such that abs(x) < 2^k.
    static bitlength(x) {
        if (x === 0n) {
            return 0;
        }
        if (x < 0) {
            x = -x;
        }
        let pp2 = zpoly.pp2;
        let r = 0;
        let i = 0;
        let j = pp2.length - 1;
        while (x >= pp2[j]) {
            x >>= BigInt(j << 5);
            r += j << 5;
        }
        while ((j - i) > 1) {
            let k = (i + j) >>> 1;
            if (x >= pp2[k]) {
                i = k;
            } else {
                j = k;
            }
        }
        i <<= 5;
        r += i;
        x >>= BigInt(i);
        // Now x fits on 32 bits.
        return r + (32 - Math.clz32(Number(x) | 0));
    }

    // Get the maximum bit length across all coefficients of a.
    static max_bitlength(logn, a) {
        let n = 1 << logn;
        let m = 0;
        for (let i = 0; i < n; i ++) {
            m = Math.max(m, zpoly.bitlength(a[i]));
        }
        return m;
    }

    // a <- a - (b*c)*2^e
    static sub_mul(logn, a, b, c, e) {
        let n = 1 << logn;
        e = BigInt(e);
        for (let k = 0; k < n; k ++) {
            let s = 0n;
            for (let i = 0; i <= k; i ++) {
                let j = k - i;
                s += b[i] * c[j];
            }
            for (let i = k + 1; i < n; i ++) {
                let j = k + n - i;
                s -= b[i] * c[j];
            }
            a[k] -= s << e;
        }
    }
}

// -------------------------------------------------------------------------
// Gaussian sampler.
//
// This is used for signing. Each sampling operation takes as parameters
// mu and 1/sigma (floating-point values) and returns an integer sampled
// with a Gaussian distribution centred on mu and with standard deviation
// sigma. Rejection sampling is used internally. The random source is an
// object with two functions, extract_u8() ans extract_u32(), which return
// (pseudo)random bytes and 32-bit values, respectively. The extract_u32()
// function is equivalent to calling extract_u8() four times, then
// interpreting the value with little-endian convention.
// Exception (for tests): if the sample_be field is set to true, then
// extract_u32() is assumed to use big-endian convention instead.
class sampler {
    // Build this object for the provided degree and random source.
    constructor(logn, rng) {
        this.logn = logn;
        this.rng = rng;
        this.sample_be = false;
    }

    // Constants for gaussian0().
    static GAUSS0 = new Uint32Array([
        10745844,  3068844,  3741698,
         5559083,  1580863,  8248194,
         2260429, 13669192,  2736639,
          708981,  4421575, 10046180,
          169348,  7122675,  4136815,
           30538, 13063405,  7650655,
            4132, 14505003,  7826148,
             417, 16768101, 11363290,
              31,  8444042,  8086568,
               1, 12844466,   265321,
               0,  1232676, 13644283,
               0,    38047,  9111839,
               0,      870,  6138264,
               0,       14, 12545723,
               0,        0,  3104126,
               0,        0,    28824,
               0,        0,      198,
               0,        0,        1 ]);

    // Sample a value for the half-Gaussian centred on 0. Precision is
    // 72-bit; 9 bytes are extracted from the random source.
    gaussian0() {
        let t0 = this.rng.extract_u32();
        let t1 = this.rng.extract_u32();
        if (this.sample_be) {
            let tt = t0;
            t0 = t1;
            t1 = tt;
        }
        let t2 = this.rng.extract_u8();
        let v0 = t0 & 0xFFFFFF;
        let v1 = ((t0 >>> 24) & 0xFF) | ((t1 & 0xFFFF) << 8);
        let v2 = ((t1 >>> 16) & 0xFFFF) | (t2 << 16);
        let gt = sampler.GAUSS0;
        let z = 0;
        for (let i = 0; i < gt.length; i += 3) {
            let cc = (v0 - gt[i + 2]) >>> 31;
            cc = (((v1 - gt[i + 1]) | 0) - cc) >>> 31;
            cc = (((v2 - gt[i + 0]) | 0) - cc) >>> 31;
            z += cc;
        }
        return z;
    }

    // Constants for expm().
    static EXPM_V = [
        0.999999999999994892974086724280,
        0.500000000000019206858326015208,
        0.166666666666984014666397229121,
        0.041666666666110491190622155955,
        0.008333333327800835146903501993,
        0.001388888894063186997887560103,
        0.000198412739277311890541063977,
        0.000024801566833585381209939524,
        0.000002755586350219122514855659,
        0.000000275607356160477811864927,
        0.000000025299506379442070029551,
        0.000000002073772366009083061987 ];

    // Compute ccs*exp(-x). This assumes that 0 <= x < log(2), and
    // 0 <= ccs <= 1. The computation is done over floating-point
    // values rather than integers (as in "normal" FN-DSA) since JavaScript
    // is bad at 64-bit integers; this should still be fine (as per the
    // security analysis of Falcon) but it can occasionally deviate
    // from the spec. This is not a problem as long as nobody tries to
    // use this code and another implementation with the same key and
    // the same nonce (we use random 40-byte nonces; this really implies
    // that we should not try to go into full deterministic mode with
    // derandomization).
    static expm(x, ccs) {
        let ev = sampler.EXPM_V;
        let y = -x;
        let z = ev[ev.length - 1];
        for (let i = ev.length - 2; i >= 0; i --) {
            z = z * y + ev[i];
        }
        return ccs * (1.0 + z * y);
    }

    // Constants for sampling.
    static INV_SIGMA = [
        0.0000000000000000000000000000,  // unused
        0.0069054793295940880906713665,
        0.0068102267767177968038616597,
        0.0067188101910722703921652332,
        0.0065883354370073659092565954,
        0.0064651781207602891654584453,
        0.0063486788828078987920178200,
        0.0062382586529084365148389856,
        0.0061334065020930252434827600,
        0.0060336696681577229109394444,
        0.0059386453095331154933278483 ];
    static SIGMA_MIN = [
        0.0000000000000000000000000000,  // unused
        1.1165085072329101745225443665,
        1.1321247692325271394508945377,
        1.1475285353733668536335699173,
        1.1702540788534829818701155091,
        1.1925466358390344190354426246,
        1.2144300507766139229914870157,
        1.2359260567719809742470715719,
        1.2570545284063214808156772051,
        1.2778336969128336608747531500,
        1.2982803343442919086214715207 ];

    // Sample a bit with probability ccs*exp(-x). We have x >= 0.
    ber_exp(x, ccs) {
        // x = s*log(2) + r, s integer, 0 <= r < 1
        // We can use trunc() because x >= 0.
        let s = Math.trunc(x * 1.4426950408889633870046509401);
        let r = x - s * 0.69314718055994530941723212146;

        // Compute ccs*exp(-x) = ccs*exp(-r), then convert it to a
        // 64-bit value (broken into low and high 32 bits). We apply
        // the process as the C code:
        //   multiply by 2^63 and truncate
        //   multiply by 2 and subtract 1
        let e = sampler.expm(r, ccs);
        e *= 2147483648.0;
        let z1 = e | 0;
        e = (e - z1) * 4294967296.0;
        let z0 = e | 0;
        z1 = (z1 << 1) | (z0 >>> 31);
        z0 <<= 1;

        // Right-shift by s bits. We have three cases to distinguish:
        //   s > 63: we replace it with s = 63.
        //   63 >= s >= 32
        //   31 >= s
        // We try to do that in a constant-time way, however futile that
        // may be in JavaScript.
        s = (s | ((63 - s) >>> 26)) & 63;
        let sm = -(s >>> 5) | 0;
        z0 ^= sm & (z0 ^ z1);
        z1 &= ~sm;
        s &= 31;
        z0 = (z0 >>> s) | ((z1 << (31 - s)) << 1);
        z1 >>>= s;

        // Sampling uses random bytes one by one, lazily.
        for (let j = 0; j < 2; j ++) {
            for (let i = 24; i >= 0; i -= 8) {
                let w = this.rng.extract_u8();
                let bz = (z1 >>> i) & 0xFF;
                if (w !== bz) {
                    return w < bz;
                }
            }
            z1 = z0;
        }
        return false;
    }

    // Get next sampled value (integer) for the provided centre (mu)
    // and inverse standard deviation (isigma).
    next(mu, isigma) {
        // Split mu = s + r for integer, and 0 <= r < 1
        let s = Math.floor(mu);
        let r = mu - s;
        // dss = 1/(2*sigma^2)
        let dss = (isigma * isigma) * 0.5;
        // ccs = sigma_min / sigma
        let ccs = isigma * sampler.SIGMA_MIN[this.logn];

        for (;;) {
            let z0 = this.gaussian0();
            let b = this.rng.extract_u8() & 1;
            // z = -z0 if b = 0, or z0 + 1 if b = 1
            let z = (((z0 << 1) + 1) & -b) - z0;

            // x = ((z - r)^2)/(2*sigma^2) - ((z - b)^2)/(2*sigma0^2)
            // (with sigma0 = 1.8205)
            let x = z - r;
            x = (x * x) * dss;
            x -= (z0 * z0) * 0.15086504887537272034947477550;

            // BerExp: sample a bit with probability ccs*exp(-x).
            if (this.ber_exp(x, ccs)) {
                return s + z;
            }
        }
    }

    // Fast Fourier sampling, inner function.
    // g00, g01 and g11 are consumed. t0 and t1 are set. tmp must have
    // size at least 4*n elements.
    ffsamp_fft_inner(logn, t0, t1, g00, g01, g11, tmp) {
        // Deepest recursion layer: the LDL tree leaf is just g00
        // (which has length 1 at this point).
        if (logn === 0) {
            let leaf = g00[0];
            leaf = Math.sqrt(leaf) * sampler.INV_SIGMA[this.logn];
            t0[0] = this.next(t0[0], leaf);
            t1[0] = this.next(t1[0], leaf);
            return;
        }

        // General case: logn >= 1.
        let n = 1 << logn;
        let hn = n >>> 1;

        // Decompose G into LDL; the decomposed matrix replaces G.
        fpoly.LDL_fft(logn, g00, g01, g11);

        // Split d00 and d11 (currently in g00 and g11) and expand them
        // into half-size quasi-cyclic Gram matrices. We also save l10
        // (currently in g01) into tmp.
        tmp.set(g01.subarray(0, n));
        let w0 = tmp.subarray(n, n + hn);
        let w1 = tmp.subarray(n + hn, n << 1);
        fpoly.split_selfadj_fft(logn, w0, w1, g00);
        g00.set(w0, 0);
        g00.set(w1, hn);
        g01.set(w0, 0);
        fpoly.split_selfadj_fft(logn, w0, w1, g11);
        g11.set(w0, 0);
        g11.set(w1, hn);
        g01.set(w0, hn);

        // The half-size Gram matrices for the recursive LDL tree
        // exploration are now:
        //   - left sub-tree:   g00[0..hn], g00[hn..n], g01[0..hn]
        //   - right sub-tree:  g11[0..hn], g11[hn..n], g01[hn..n]
        // l10 is in tmp[0..n].
        let left_00 = g00;
        let left_01 = g00.subarray(hn);
        let right_00 = g11;
        let right_01 = g11.subarray(hn);
        let left_11 = g01;
        let right_11 = g01.subarray(hn);

        // We split t1 and use the first recursive call on the two
        // halves, using the right sub-tree. The result is merged
        // back into tmp[2*n..3*n].
        w0 = tmp.subarray(n, n + hn);
        w1 = tmp.subarray(n + hn, n << 1);
        let w2 = tmp.subarray(n << 1);

        fpoly.split_fft(logn, w0, w1, t1);
        this.ffsamp_fft_inner(logn - 1, w0, w1,
                right_00, right_01, right_11, w2);
        fpoly.merge_fft(logn, w2, w0, w1);

        // At this point:
        //   t0 and t1 are unmodified
        //   l10 is in tmp[0..n]
        //   z1 is in tmp[2*n..3*n]
        // We compute tb0 = t0 + (t1 - z1)*l10.
        // tb0 is written over t0.
        // z1 is moved into t1.
        // l10 is scratched.
        let l10 = tmp;
        let w = tmp.subarray(n, n << 1);
        let z1 = w2;
        w.set(t1.subarray(0, n));
        fpoly.sub(logn, w, z1);
        t1.set(z1.subarray(0, n));
        fpoly.mul_fft(logn, l10, w);
        fpoly.add(logn, t0, l10);

        // Second recursive invocation, on the split tb0 (currently in t0),
        // using the left sub-tree.
        // tmp is free.
        w0 = tmp;
        w1 = tmp.subarray(hn);
        w2 = tmp.subarray(n);
        fpoly.split_fft(logn, w0, w1, t0);
        this.ffsamp_fft_inner(logn - 1,
                w0, w1, left_00, left_01, left_11, w2);
        fpoly.merge_fft(logn, t0, w0, w1);
    }

    // Fast Fourier sampling.
    // g00, g01 and g11 are consumed. t0 and t1 are set. tmp must have
    // size at least 4*n elements.
    ffsamp_fft(t0, t1, g00, g01, g11, tmp) {
        this.ffsamp_fft_inner(this.logn, t0, t1, g00, g01, g11, tmp);
    }
}

// -------------------------------------------------------------------------
// FN-DSA (core).
//
// The external API uses the functions in that class to perform the FN-DSA
// operations. These functions assume that some validity filtering has been
// performed by the caller.
class core {

    // Keygen Gaussian table, for degrees 4 to 256.
    static gauss_tab8 = [
            1,     3,     6,    11,    22,    40,    73,   129,
          222,   371,   602,   950,  1460,  2183,  3179,  4509,
         6231,  8395, 11032, 14150, 17726, 21703, 25995, 30487,
        35048, 39540, 43832, 47809, 51385, 54503, 57140, 59304,
        61026, 62356, 63352, 64075, 64585, 64933, 65164, 65313,
        65406, 65462, 65495, 65513, 65524, 65529, 65532, 65534 ];
    // Keygen Gaussian table, for degree 512.
    static gauss_tab9 = [
            1,     4,    11,    28,    65,   146,   308,   615,
         1164,  2083,  3535,  5692,  8706, 12669, 17574, 23285,
        29542, 35993, 42250, 47961, 52866, 56829, 59843, 62000,
        63452, 64371, 64920, 65227, 65389, 65470, 65507, 65524,
        65531, 65534 ];
    // Keygen Gaussian table, for degree 1024.
    static gauss_tab10 = [
            2,     8,    28,    94,   280,   742,  1761,  3753,
         7197, 12472, 19623, 28206, 37329, 45912, 53063, 58338,
        61782, 63774, 64793, 65255, 65441, 65507, 65527, 65533 ];

    // Generate a new f or g polynomial. 'sh' is a SHAKE256 instance
    // in output mode. The sampled polynomial has odd parity and is
    // returned as a new Int8Array.
    static keygen_gauss(logn, sh) {
        if (logn < 9) {
            let gt = this.gauss_tab8;
            let zz = 1 << (8 - logn);
            let n = 1 << logn;
            let f = new Int8Array(n);
            for (;;) {
                let parity = 0;
                for (let i = 0; i < n; i ++) {
                    let v = 0;
                    for (let j = 0; j < zz; j ++) {
                        let y = sh.extract_u16();
                        v -= gt.length >>> 1;
                        for (let k = 0; k < gt.length; k ++) {
                            v += ((gt[k] - y) >> 20) & 1;
                        }
                    }
                    if (v < -127 || v > +127) {
                        i --;
                    } else {
                        f[i] = v;
                        parity ^= (v & 1);
                    }
                }
                if (parity === 1) {
                    return f;
                }
            }
        }

        let gt = (logn === 9) ? this.gauss_tab9 : this.gauss_tab10;
        let n = 1 << logn;
        let f = new Int8Array(n);
        for (;;) {
            let parity = 0;
            for (let i = 0; i < n; i ++) {
                let y = sh.extract_u16();
                let v = -(gt.length >>> 1);
                for (let k = 0; k < gt.length; k ++) {
                    v += ((gt[k] - y) >> 20) & 1;
                }
                f[i] = v;
                parity ^= (v & 1);
            }
            if (parity === 1) {
                return f;
            }
        }
    }

    // Given polynomials f and g (Int8Array), set F and G (also Int8Array)
    // such that f*G - g*F = q. This function may fail for a variety of
    // reasons (typically, because the resultants of f and g with x^n+1
    // are not coprime).
    // Returns true on success, false on error. On success, it is guaranteed
    // that f*G - g*F = q, and all coefficients of F and G are in [-127,+127].
    static solve_NTRU(logn, f, g, F, G) {
        // We need to use BigInt for the values.
        let n = 1 << logn;
        let bf = new Array(n);
        let bg = new Array(n);
        for (let i = 0; i < n; i ++) {
            bf[i] = BigInt(f[i]);
            bg[i] = BigInt(g[i]);
        }
        let bF = new Array(n);
        let bG = new Array(n);
        if (!core.solve_NTRU_rec(logn, bf, bg, bF, bG)) {
            return false;
        }
        for (let i = 0; i < n; i ++) {
            let x = bF[i];
            let y = bG[i];
            if (x < -127 || x > +127 || y < -127 || y > +127) {
                return false;
            }
            F[i] = Number(x);
            G[i] = Number(y);
        }
        return true;
    }

    // Recursive inner function for solve_NTRU().
    static solve_NTRU_rec(logn, f, g, F, G) {
        if (logn === 0) {
            // Deepest recursion level. Polynomials have size 1.
            let xf = f[0];
            let xg = g[0];
            if ((xf & 1n) !== 1n || (xg & 1n) !== 1n || xf <= 0 || xg <= 0) {
                throw new Error();
            }
            let a = xf;
            let b = xg;
            let u0 = 1n;
            let v0 = 0n;
            let u1 = xg;
            let v1 = xf - 1n;

            while (a !== 0n) {
                if ((a & 1n) !== 0n) {
                    if (a < b) {
                        let t = a; a = b; b = t;
                        t = u0; u0 = u1; u1 = t;
                        t = v0; v0 = v1; v1 = t;
                    }
                    a -= b;
                    u0 -= u1;
                    v0 -= v1;
                    if (u0 < 0) {
                        u0 += xg;
                    }
                    if (v0 < 0) {
                        v0 += xf;
                    }
                }
                a >>= 1n;
                if ((u0 & 1n) !== 0n) {
                    u0 += xg;
                }
                if ((v0 & 1n) !== 0n) {
                    v0 += xf;
                }
                u0 >>= 1n;
                v0 >>= 1n;
            }

            // GCD is in b; it should be 1.
            if (b !== 1n) {
                return false;
            }
            F[0] = v1 * BigInt(mq.Q);
            G[0] = u1 * BigInt(mq.Q);
            return true;
        } else {
            // Intermediate recursion level.
            let n = 1 << logn;
            let hn = n >>> 1;

            // Split f and g into even and odd-indexed coefficients:
            //   f = f0(x^2) + x*f1(x^2)
            //   g = g0(x^2) + x*g1(x^2)
            // Then do a recursive call on:
            //   f' = f0^2 - f1^2
            //   g' = g0^2 - g1^2
            let fp = new Array(hn);
            let gp = new Array(hn);
            zpoly.galois_norm(logn, fp, f);
            zpoly.galois_norm(logn, gp, g);
            let Fp = new Array(hn);
            let Gp = new Array(hn);
            if (!core.solve_NTRU_rec(logn - 1, fp, gp, Fp, Gp)) {
                return false;
            }

            // We have:
            //   f' = (f*conj(f))(x^2)
            //   g' = (g*conj(g))(x^2)
            // with:
            //   conj(f) = f0(x^2) - x*f1(x^2)
            //   conj(g) = g0(x^2) - x*g1(x^2)
            // Recursive call yielded F' and G' such that:
            //   f'*G' - g'*F' = q
            // Thus:
            //   f*(conj(f)*G'(x^2)) - g*(conj(g)*F'(x^2)) = q
            // We can get F and G as:
            //   F = conj(g) * F'(x^2)
            //   G = conj(f) * G'(x^2)
            zpoly.mul_conj_hd(logn, F, g, Fp);
            zpoly.mul_conj_hd(logn, G, f, Gp);

            // We must now reduce (F,G) to make their coefficients not
            // (much) bigger than those of (f,g). This uses Babai's
            // round-off:
            //   k <- round((F*adj(f) + G*adj(g)) / (f*adj(f) + g*adj(g)))
            //   F <- F - k*f
            //   G <- G - k*g
            // We need to "scale down" f, g, F, and G for the computation of
            // k, so that we do not get overflows (floating-point values
            // can range only up to 2^1023). We cannot expect to reduce
            // values for more than a few dozen bits at each try, since
            // floating-point values have limited precision; we arrange for
            // k to remain "small".
            // If we cannot make (F,G) about as small as (f,g) then we
            // declare a failure.
            let fgbl = Math.max(
                zpoly.max_bitlength(logn, f),
                zpoly.max_bitlength(logn, g));
            let scale_fg = BigInt(fgbl < 100 ? 0 : fgbl - 100);
            let FGbl = Math.max(
                zpoly.max_bitlength(logn, F),
                zpoly.max_bitlength(logn, G));
            let scale_FG = scale_fg + BigInt(FGbl - fgbl);

            // fx <- adj(f)/(f*adj(f) + g*adj(g))
            // gx <- adj(g)/(f*adj(f) + g*adj(g))
            let fx = new Float64Array(n);
            let gx = new Float64Array(n);
            for (let i = 0; i < n; i ++) {
                fx[i] = Number(f[i] >> scale_fg);
                gx[i] = Number(g[i] >> scale_fg);
            }
            fpoly.FFT(logn, fx);
            fpoly.FFT(logn, gx);
            for (let i = 0; i < hn; i ++) {
                let x0 = fx[i];
                let x1 = fx[i + hn];
                let y0 = gx[i];
                let y1 = gx[i + hn];
                let z = (x0 * x0 + x1 * x1) + (y0 * y0 + y1 * y1);
                fx[i] = x0 / z;
                fx[i + hn] = -x1 / z;
                gx[i] = y0 / z;
                gx[i + hn] = -y1 / z;
            }

            let fx2 = fx.slice();
            let gx2 = gx.slice();
            fpoly.iFFT(logn, fx2);
            fpoly.iFFT(logn, gx2);

            // Reduce (F,G) repeatedly until it has reached the size of (f,g).
            let Fx = new Float64Array(n);
            let Gx = new Float64Array(n);
            let kx = new Float64Array(n);
            let k = new Array(n);
            while (scale_FG >= scale_fg) {
                // Convert (F,G) (scaled down) to floating-point.
                for (let i = 0; i < n; i ++) {
                    Fx[i] = Number(F[i] >> scale_FG);
                    Gx[i] = Number(G[i] >> scale_FG);
                }
                fpoly.FFT(logn, Fx);
                fpoly.FFT(logn, Gx);
                fpoly.mul_mul_add(logn, kx, Fx, fx, Gx, gx);
                fpoly.iFFT(logn, kx);
                for (let i = 0; i < n; i ++) {
                    k[i] = BigInt(Math.round(kx[i]));
                }
                zpoly.sub_mul(logn, F, f, k, scale_FG - scale_fg);
                zpoly.sub_mul(logn, G, g, k, scale_FG - scale_fg);
                // We assume we skimmed 20 bits off the size (at least).
                if (scale_FG === scale_fg) {
                    break;
                } else {
                    scale_FG -= 20n;
                    if (scale_FG < scale_fg) {
                        scale_FG = scale_fg;
                    }
                }
            }

            // (F,G) are normally reduced. We check that they are indeed
            // not much longer than (f,g).
            FGbl = Math.max(
                zpoly.max_bitlength(logn, F),
                zpoly.max_bitlength(logn, G));
            if (FGbl > fgbl + 20) {
                return false;
            }
            return true;
        }
    }

    // Keygen, inner function. 'sh' is the SHAKE256 instance used as
    // random source. Returned value is an object with 5 fields:
    //    f    Int8Array
    //    g    Int8Array
    //    F    Int8Array
    //    G    Int8Array
    //    h    Uint16Array (h = g/f mod x^n+1 mod q, 'ext' format)
    static keygen_inner(logn, sh) {
        let n = 1 << logn;
        let hn = n >> 1;
        for (;;) {
            // Generate (f,g) with odd parity.
            let f = core.keygen_gauss(logn, sh);
            let g = core.keygen_gauss(logn, sh);

            // Ensure that ||(g,-f)|| < 1.17*sqrt(q).
            let sn = 0;
            for (let i = 0; i < n; i ++) {
                sn += f[i] * f[i] + g[i] * g[i];
            }
            if (sn >= 16823) {
                continue;
            }

            // f must be invertible modulo x^n+1 and modulo q.
            let qf = new Uint16Array(n);
            mq.poly_small_to_int(logn, f, qf);
            mq.poly_int_to_ntt(logn, qf);
            if (!mq.poly_is_invertible_ntt(logn, qf)) {
                continue;
            }

            // The orthogonalized vector must also have an acceptable norm.
            let fx = new Float64Array(n);
            let gx = new Float64Array(n);
            let t3 = new Float64Array(hn);
            fpoly.set_small(logn, fx, f);
            fpoly.set_small(logn, gx, g);
            fpoly.FFT(logn, fx);
            fpoly.FFT(logn, gx);
            fpoly.invnorm_fft(logn, t3, fx, gx);
            fpoly.adj_fft(logn, fx);
            fpoly.adj_fft(logn, gx);
            fpoly.mulconst(logn, fx, mq.Q);
            fpoly.mulconst(logn, gx, mq.Q);
            fpoly.mul_selfadj_fft(logn, fx, t3);
            fpoly.mul_selfadj_fft(logn, gx, t3);
            fpoly.iFFT(logn, fx);
            fpoly.iFFT(logn, gx);
            let snx = 0;
            for (let i = 0; i < n; i ++) {
                snx += fx[i] * fx[i] + gx[i] * gx[i];
            }
            if (snx >= 1.3689 * mq.Q) {
                continue;
            }

            // Find (F,G) to complete the basis.
            let F = new Int8Array(n);
            let G = new Int8Array(n);
            if (!core.solve_NTRU(logn, f, g, F, G)) {
                continue;
            }

            // Compute the public key h = g/f mod x^n+1 mod q.
            let h = new Uint16Array(n);
            mq.poly_small_to_int(logn, g, h);
            mq.poly_int_to_ntt(logn, h);
            mq.poly_div_ntt(logn, h, qf);
            mq.poly_ntt_to_int(logn, h);
            mq.poly_int_to_ext(logn, h);

            return { f: f, g: g, F: F, G: G, h: h };
        }
    }

    // Get the number of bits for encoding each coefficient of (f,g).
    static fgbits(logn) {
        if (logn <= 5) {
            return 8;
        } else if (logn <= 7) {
            return 7;
        } else if (logn <= 9) {
            return 6;
        } else {
            return 5;
        }
    }

    // Encoded size of a signing (private) key, in bytes.
    static sign_key_length(logn) {
        return 1 + ((4 + core.fgbits(logn)) << (logn - 2));
    }

    // Encoded size of a verifying (public) key, in bytes.
    static verify_key_length(logn) {
        return 1 + (7 << (logn - 2));
    }

    static sig_length = [ 0, 0, 47, 52, 63, 82, 122, 200, 356, 666, 1280 ];

    // Encoded size of a signature, in bytes.
    static signature_length(logn) {
        return core.sig_length[logn];
    }

    // Hash the provided verifying key with SHAKE256, output is 64 bytes
    // (returned as a new Uint8Array).
    static hash_vkey(vkey) {
        let sh = new SHAKE(256);
        sh.inject(vkey);
        sh.flip();
        let hk = new Uint8Array(64);
        sh.extract(hk);
        return hk;
    }

    // Special hash identifier for "original Falcon" mode.
    // FIXME: remove support for original Falcon code. This is currently
    // supported internally for test code.
    static ID_ORIG = new Uint8Array([0xFF]);

    // Special hash identifier for "raw" signing (no pre-hashing).
    static ID_RAW = new Uint8Array([0x00]);

    // Hash message (with nonce, hashed public key, context string,
    // and (pre-hashed) message) into polynomial c (Uint16Array).
    static hash_to_point(logn, nonce, hk, ctx, id, hv, c) {
        if (typeof ctx === "string") {
            ctx = new TextEncoder().encode(ctx);
        }
        let sh = new SHAKE(256);
        sh.inject(nonce);
        if (id[0] === 0xFF) {
            // original Falcon mode
            sh.inject(hv);
        } else {
            sh.inject(hk);
            if (id.length === 0 || id[0] === 0x00) {
                sh.inject_u8(0x00);
                id = id.subarray(0, 0);
            } else {
                sh.inject_u8(0x01);
            }
            sh.inject_u8(ctx.length);
            sh.inject(ctx);
            sh.inject(id);
            sh.inject(hv);
        }
        sh.flip();

        let n = 1 << logn;
        let i = 0;
        while (i < n) {
            // Right now 16-bit values are extracted with big-endian
            // convention.
            let w1 = sh.extract_u8();
            let w0 = sh.extract_u8();
            let w = (w1 << 8) | w0;
            if (w < 61445) {
                while (w >= 12289) {
                    w -= 12289;
                }
                c[i ++] = w;
            }
        }
    }

    // Keygen. This returns an object with two fields:
    //    sign_key     signing key (private)
    //    verify_key   verifying key (public)
    // Both keys are in encoded format (Uint8Array).
    static keygen(logn) {
        let seed = new Uint8Array(32);
        globalThis.crypto.getRandomValues(seed);

        let sh = new SHAKE(256);
        sh.inject(seed);
        sh.flip();
        let kp = core.keygen_inner(logn, sh);
        let sk = new Uint8Array(core.sign_key_length(logn));
        let vk = new Uint8Array(core.verify_key_length(logn));

        let n = 1 << logn;
        let fgbits = core.fgbits(logn);
        sk[0] = 0x50 + logn;
        let j = 1;
        j += codec.trim_i8_encode(logn, kp.f, fgbits, sk.subarray(j));
        j += codec.trim_i8_encode(logn, kp.g, fgbits, sk.subarray(j));
        j += codec.trim_i8_encode(logn, kp.F, 8, sk.subarray(j));
        if (j !== sk.length) {
            throw new Error();
        }

        vk[0] = 0x00 + logn;
        j = 1;
        j += codec.mqpoly_encode(logn, kp.h, vk.subarray(j));
        if (j !== vk.length) {
            throw new Error();
        }

        return { sign_key: sk, verify_key: vk };
    }

    // Decode a signing key from bytes. Returns null on error.
    static decode_sign_key(sk) {
        if (sk.length === 0) {
            return null;
        }
        if ((sk[0] & 0xF0) !== 0x50) {
            return null;
        }
        let logn = sk[0] & 0x0F;
        if (logn < 2 || logn > 10) {
            return null;
        }
        if (sk.length !== core.sign_key_length(logn)) {
            return null;
        }
        let n = 1 << logn;
        let fgbits = core.fgbits(logn);
        let f = new Int8Array(n);
        let g = new Int8Array(n);
        let F = new Int8Array(n);
        let G = new Int8Array(n);
        let j = 1;
        let k = codec.trim_i8_decode(logn, sk.subarray(j), f, fgbits);
        if (k === 0) {
            return null;
        }
        j += k;
        k = codec.trim_i8_decode(logn, sk.subarray(j), g, fgbits);
        if (k === 0) {
            return null;
        }
        j += k;
        k = codec.trim_i8_decode(logn, sk.subarray(j), F, 8);
        if (k === 0) {
            return null;
        }

        let t0 = new Uint16Array(n);
        let t1 = new Uint16Array(n);

        // t0 <- h = g/f
        mq.poly_small_to_int(logn, g, t0);
        mq.poly_small_to_int(logn, f, t1);
        mq.poly_int_to_ntt(logn, t0);
        mq.poly_int_to_ntt(logn, t1);
        if (!mq.poly_div_ntt(logn, t0, t1)) {
            // f is not invertible
            return null;
        }

        // t1 <- G = h*F
        mq.poly_small_to_int(logn, F, t1);
        mq.poly_int_to_ntt(logn, t1);
        mq.poly_mul_ntt(logn, t1, t0);
        mq.poly_ntt_to_int(logn, t1);
        if (!mq.poly_int_to_small(logn, t1, G)) {
            // Recomputed G is off-range.
            return null;
        }

        mq.poly_ntt_to_int(logn, t0);
        mq.poly_int_to_ext(logn, t0);
        return { logn: logn, f: f, g: g, F: F, G: G, h: t0 };
    }

    // Inner signature function, working other the provided seed.
    static sign_inner(kp, ctx, id, hv, seed) {
        let logn = kp.logn;
        let n = 1 << logn;
        let f = kp.f;
        let g = kp.g;
        let F = kp.F;
        let G = kp.G;
        // Hash verifying key.
        let vk = new Uint8Array(core.verify_key_length(logn));
        vk[0] = 0x00 + logn;
        codec.mqpoly_encode(logn, kp.h, vk.subarray(1));
        let hk = core.hash_vkey(vk);

        // Flag for "original Falcon" mode (used mostly for test purposes).
        let orig_falcon = (id.length === 1 && id[0] === 0xFF);

        // Compute the lattice basis B = [[g, -f], [G, -F]] in FFT
        // representation.
        let b00 = new Float64Array(n);
        let b01 = new Float64Array(n);
        let b10 = new Float64Array(n);
        let b11 = new Float64Array(n);
        fpoly.set_small(logn, b00, g);
        fpoly.set_small(logn, b01, f);
        fpoly.set_small(logn, b10, G);
        fpoly.set_small(logn, b11, F);
        fpoly.neg(logn, b01);
        fpoly.neg(logn, b11);
        fpoly.FFT(logn, b00);
        fpoly.FFT(logn, b01);
        fpoly.FFT(logn, b10);
        fpoly.FFT(logn, b11);

        // Compute the Gram matrix G = B*adj(B):
        //    g00 = b00*adj(b00) + b01*adj(b01)
        //    g01 = b00*adj(b10) + b01*adj(b11)
        //    g10 = b10*adj(b00) + b11*adj(b01)
        //    g11 = b10*adj(b10) + b11*adj(b11)
        // Note that g10 = adj(g01); we keep only g01. g00 and g11 are
        // self-adjoint so their upper halves are all-zeros (in FFT
        // representation).
        let sav_g00 = new Float64Array(n);
        let sav_g01 = new Float64Array(n);
        let sav_g11 = new Float64Array(n);
        fpoly.gram_fft(logn, b00, b01, b10, b11, sav_g00, sav_g01, sav_g11);
        let g00 = new Float64Array(n);
        let g01 = new Float64Array(n);
        let g11 = new Float64Array(n);

        let sh = new SHAKE(256);
        let nonce = new Uint8Array(40);
        let subseed = new Uint8Array(56);
        let hm = new Uint16Array(n);
        let t0 = new Float64Array(n);
        let t1 = new Float64Array(n);
        let tmp = new Float64Array(n << 2);
        let s2 = new Int16Array(n);
        let sig = new Uint8Array(core.signature_length(logn));
        for (let counter = 0;; counter ++) {
            // Make nonce and subseed value.
            // Normally we regenerate both nonce and subseed at each
            // iteration. If we are in "original Falcon" mode, then we
            // do not change the nonce in subsequent iterations.
            // FIXME: remove "original Falcon" support.
            sh.reset();
            sh.inject(seed);
            sh.inject_u32(counter);
            sh.flip();
            if (orig_falcon) {
                if (counter === 0) {
                    sh.extract(nonce);
                    sh.extract(subseed);
                } else {
                    sh.extract(subseed);
                }
            } else {
                sh.extract(nonce);
                sh.extract(subseed);
            }

            // Make sampler.
            sh.reset();
            sh.inject(subseed);
            sh.flip();
            let ss = new sampler(logn, sh);

            // Hash message into a polynomial.
            core.hash_to_point(logn, nonce, hk, ctx, id, hv, hm);

            // Set the target [t0, t1] to [hm, 0].
            fpoly.apply_basis(logn, t0, t1, b01, b11, hm);

            // Fast Fourier sampling.
            g00.set(sav_g00);
            g01.set(sav_g01);
            g11.set(sav_g11);
            ss.ffsamp_fft(t0, t1, g00, g01, g11, tmp);

            // Get the lattice point corresponding to the sampled vector.
            let tx = tmp.subarray(0, n);
            let ty = tmp.subarray(n, n << 1);
            tx.set(t0);
            ty.set(t1);
            fpoly.mul_fft(logn, tx, b00);
            fpoly.mul_fft(logn, ty, b10);
            fpoly.add(logn, tx, ty);
            ty.set(t0);
            fpoly.mul_fft(logn, ty, b01);
            t0.set(tx);
            fpoly.mul_fft(logn, t1, b11);
            fpoly.add(logn, t1, ty);
            fpoly.iFFT(logn, t0);
            fpoly.iFFT(logn, t1);

            // We compute s1, then s2 into buffer s2.
            // We do not retain s1 but we compute its squared norm. Since
            // JavaScript numbers are exact for integers up to 2^53, we
            // can compute the norm without any special saturation behaviour.
            let sqn = 0;
            for (let i = 0; i < n; i ++) {
                let z = hm[i] - (Math.round(t0[i]) | 0);
                sqn += z * z;
            }
            for (let i = 0; i < n; i ++) {
                let z = -Math.round(t1[i]);
                sqn += z * z;
                s2[i] = z & 0xFFFF;
            }

            // If the squared norm is not acceptable, we loop.
            if (!mq.poly_sqnorm_is_acceptable(logn, sqn)) {
                continue;
            }

            // We have a candidate signature; we must encode it. This may
            // fail, if the signature cannot be encoded in the target size.
            let d = sig.subarray(41);
            let dlen = sig.length - 41;
            if (codec.comp_encode(logn, s2, d, dlen)) {
                // Success!
                sig[0] = 0x30 + logn;
                sig.set(nonce, 1);
                return sig;
            }
        }
    }

    // Sign.
    //    sk    signing key (encoded, Uint8Array)
    //    ctx   context string (Uint8Array or string)
    //    id    pre-hashing identifier
    //    hv    pre-hashed message (Uint8Array)
    // If id is core.ID_RAW, then the message is not pre-hashed.
    // Returned value is the new signature (Uint8Array).
    static sign(sk, ctx, id, hv) {
        let kp = core.decode_sign_key(sk);
        if (kp === null) {
            throw new Error('invalid signing key');
        }
        let seed = new Uint8Array(56);
        globalThis.crypto.getRandomValues(seed);
        return core.sign_inner(kp, ctx, id, hv, seed);
    }

    // Verify a signature.
    //    sig   signature (Uint8Array)
    //    vk    verifying key (encoded, Uint8Array)
    //    ctx   context string (Uint8Array or string)
    //    id    pre-hashing identifier
    //    hv    pre-hashed message (Uint8Array)
    // Returns true on success, false on error (including when the
    // verifying key is invalid).
    static verify(sig, vk, ctx, id, hv) {
        if (sig.length === 0 || vk.length === 0) {
            return false;
        }
        let logn = vk[0];
        if (logn < 2 || logn > 10 || sig[0] !== 0x30 + logn) {
            return false;
        }
        if (sig.length !== core.signature_length(logn)) {
            return false;
        }
        if (vk.length !== core.verify_key_length(logn)) {
            return false;
        }
        let n = 1 << logn;
        let hk = core.hash_vkey(vk);
        let t1 = new Uint16Array(n);
        let t2 = new Uint16Array(n);

        // t1 <- h (ntt)
        if (codec.mqpoly_decode(logn, vk.subarray(1), t1) !== vk.length - 1) {
            return false;
        }
        mq.poly_ext_to_int(logn, t1);
        mq.poly_int_to_ntt(logn, t1);

        // t2 <- s2 (ntt)  (with squared norm in norm2)
        if (!codec.comp_decode(logn, sig.subarray(41), sig.length - 41, t2)) {
            return false;
        }
        let norm2 = mq.poly_sqnorm_signed(logn, t2);
        mq.poly_signed_to_int(logn, t2);
        mq.poly_int_to_ntt(logn, t2);

        // t2 <- s2*h (int)
        mq.poly_mul_ntt(logn, t2, t1);
        mq.poly_ntt_to_int(logn, t2);

        // t1 <- c (int)  (hashed message)
        core.hash_to_point(logn, sig.subarray(1, 41), hk, ctx, id, hv, t1);
        mq.poly_ext_to_int(logn, t1);

        // t1 <- s1 = c - s2*h (ext), squared norm into norm1
        mq.poly_sub(logn, t1, t2);
        mq.poly_int_to_ext(logn, t1);
        let norm1 = mq.poly_sqnorm_ext(logn, t1);

        // Check signature norm. We do not care about overflows, since
        // JS numbers can represent exact integers up to 2^53.
        return mq.poly_sqnorm_is_acceptable(logn, norm1 + norm2);
    }
}
