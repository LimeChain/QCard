export type SignerInputErrorCode =
  | "INVALID_SECRET_KEY_LENGTH"
  | "INVALID_MESSAGE"
  | "INVALID_CTX_LENGTH"
  | "INVALID_RND_LENGTH"
  | "INVALID_INNER_SEED_LENGTH"
  | "SIGNING_BYTES_EXHAUSTED"

export class SignerInputError extends Error {
  readonly code: SignerInputErrorCode

  constructor(code: SignerInputErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "SignerInputError"
  }
}
