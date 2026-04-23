import { ml_dsa44eth } from "@noble/post-quantum/ml-dsa.js"
import { encodeMlDsaPublicKey, keccakXofFactory } from "@noble/post-quantum/utils-eth.js"
import { bytesToHex, hexToBytes } from "viem"

type Hex = `0x${string}`

export function generateMlDsaEthKeypair(): {
  publicKeyHex: Hex
  secretKeyHex: Hex
  encodedPublicKey: Hex
} {
  const { publicKey, secretKey } = ml_dsa44eth.keygen()

  return {
    publicKeyHex: bytesToHex(publicKey),
    secretKeyHex: bytesToHex(secretKey),
    encodedPublicKey: bytesToHex(
      encodeMlDsaPublicKey(publicKey, keccakXofFactory, keccakXofFactory),
    ),
  }
}

export function signMlDsaEth(secretKeyHex: Hex, messageHashHex: Hex): Hex {
  const signature = ml_dsa44eth.sign(hexToBytes(messageHashHex), hexToBytes(secretKeyHex))
  return bytesToHex(signature)
}
