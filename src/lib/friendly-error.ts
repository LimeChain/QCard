export interface FriendlyUiError {
  title: string
  message: string
  action?: string
  details?: string
}

interface FriendlyErrorOptions {
  fallbackMessage?: string
}

function toMessage(err: unknown): string {
  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) {
    return err.message.trim()
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim()
  }
  try {
    return JSON.stringify(err)
  } catch {
    return "Unknown error"
  }
}

function extractCode(value: unknown): number | string | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const code = record.code
  if (typeof code === "number" || typeof code === "string") return code
  const cause = record.cause
  if (cause && typeof cause === "object") return extractCode(cause)
  return null
}

export function toFriendlyUiError(err: unknown, options: FriendlyErrorOptions = {}): FriendlyUiError {
  const rawMessage = toMessage(err)
  const lower = rawMessage.toLowerCase()
  const code = extractCode(err)

  if (
    code === 4001 ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request") ||
    lower.includes("action_rejected")
  ) {
    return {
      title: "Transaction canceled",
      message: "You canceled the wallet confirmation, so nothing was sent.",
      action: "Click the action button again and approve it in your wallet.",
      details: rawMessage,
    }
  }

  if (
    code === 4902 ||
    lower.includes("wrong network") ||
    lower.includes("chain mismatch") ||
    lower.includes("chain id") ||
    lower.includes("unsupported chain")
  ) {
    return {
      title: "Wrong network selected",
      message: "Your wallet is not on the expected network.",
      action: "Switch your wallet to Sepolia, then try again.",
      details: rawMessage,
    }
  }

  if (lower.includes("insufficient funds") || lower.includes("funds for gas")) {
    return {
      title: "Not enough funds",
      message: "The wallet does not have enough ETH to cover value and gas.",
      action: "Fund the wallet and retry.",
      details: rawMessage,
    }
  }

  if (
    lower.includes("polling timeout") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error")
  ) {
    return {
      title: "Network timeout",
      message: "The network is slow or temporarily unavailable.",
      action: "Wait a moment and retry. If needed, check Etherscan for pending transactions.",
      details: rawMessage,
    }
  }

  if (
    lower.includes("execution failed") ||
    lower.includes("reverted") ||
    lower.includes("invalid signature") ||
    lower.includes("verify() call returned false")
  ) {
    return {
      title: "On-chain validation failed",
      message: "The transaction reached validation but did not pass contract checks.",
      action: "Retry after redeploying or regenerating keys if contract configuration changed.",
      details: rawMessage,
    }
  }

  const isTechnicalDump =
    rawMessage.includes("Request Arguments:") ||
    rawMessage.includes("Contract Call:") ||
    rawMessage.includes("Docs:") ||
    rawMessage.length > 220

  if (isTechnicalDump) {
    return {
      title: "Operation failed",
      message: options.fallbackMessage ?? "The action failed due to a provider or wallet error.",
      action: "Retry once. If it still fails, open technical details and share them for debugging.",
      details: rawMessage,
    }
  }

  return {
    title: "Action required",
    message: rawMessage,
  }
}

export function fromFriendlyMessage(message: string): FriendlyUiError {
  return { title: "Action required", message }
}
