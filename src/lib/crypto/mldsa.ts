import { bytesToHex, hexToBytes } from "viem"
import { keygenWithXof, signWithXof } from "./ml-dsa-eth.core"
import { keccakXofFactory, preparePublicKeyForDeployment } from "./mldsa-encoding"

type Hex = `0x${string}`

export function generateMlDsaEthKeypair(): {
  publicKeyHex: Hex
  secretKeyHex: Hex
  encodedPublicKey: Hex
} {
  const zeta = new Uint8Array(32)
  globalThis.crypto.getRandomValues(zeta)
  const keypair = keygenWithXof(zeta, keccakXofFactory)
  return {
    publicKeyHex: bytesToHex(keypair.publicKey),
    secretKeyHex: bytesToHex(keypair.secretKey),
    encodedPublicKey: preparePublicKeyForDeployment(
      keypair.publicKey,
      keccakXofFactory,
      keccakXofFactory,
    ),
  }
}

export function signMlDsaEth(secretKeyHex: Hex, messageHashHex: Hex): Hex {
  const rnd = new Uint8Array(32)
  globalThis.crypto.getRandomValues(rnd)
  const signature = signWithXof(
    hexToBytes(secretKeyHex),
    hexToBytes(messageHashHex),
    rnd,
    new Uint8Array(0),
    keccakXofFactory,
  )
  return bytesToHex(signature)
}
