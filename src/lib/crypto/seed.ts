/**
 * Seed encryption / decryption using the Web Crypto API.
 *
 * Scheme: AES-256-GCM with PBKDF2 key derivation.
 *   - 100 000 PBKDF2 iterations, SHA-256 PRF
 *   - 16-byte random salt
 *   - 12-byte random IV
 *
 * Serialised as JSON: { salt, iv, ciphertext } (all base64).
 */

// -- helpers ----------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// -- public API -------------------------------------------------------------

/**
 * Encrypt a seed with a user-supplied password.
 * Returns a base64-encoded JSON string containing { salt, iv, ciphertext }.
 */
export async function encryptSeed(
  seed: Uint8Array,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      seed as unknown as BufferSource,
    ),
  );

  const payload = JSON.stringify({
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  });
  return toBase64(new TextEncoder().encode(payload));
}

/**
 * Decrypt a seed that was encrypted with `encryptSeed`.
 * Throws if the password is wrong or the data is corrupt.
 */
export async function decryptSeed(
  encrypted: string,
  password: string,
): Promise<Uint8Array> {
  const payloadStr = new TextDecoder().decode(fromBase64(encrypted));
  const { salt, iv, ciphertext } = JSON.parse(payloadStr) as {
    salt: string;
    iv: string;
    ciphertext: string;
  };

  const key = await deriveKey(password, fromBase64(salt));

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as unknown as BufferSource },
    key,
    fromBase64(ciphertext) as unknown as BufferSource,
  );

  return new Uint8Array(plaintext);
}

/**
 * Trigger a browser download of the encrypted seed as a `.json` file.
 */
export async function downloadSeedFile(
  encrypted: string,
  filename: string = 'pqc-seed.json',
): Promise<void> {
  const blob = new Blob([encrypted], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read an encrypted seed file picked by the user and decrypt it.
 */
export async function loadSeedFile(
  file: File,
  password: string,
): Promise<Uint8Array> {
  const text = await file.text();
  return decryptSeed(text, password);
}
