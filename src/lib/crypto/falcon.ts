import { falcon512paddedEth } from "@noble/post-quantum/falcon.js"
import { encodeFalconPublicKey, encodeFalconSignature } from "@noble/post-quantum/utils-eth.js"
import { bytesToHex, hexToBytes } from "viem"

type Hex = `0x${string}`

function encodePublicKeyForZKNOX(rawPublicKey: Uint8Array): Hex {
  return bytesToHex(encodeFalconPublicKey(rawPublicKey))
}

function encodeSignatureForZKNOX(nobleSig: Uint8Array): Hex {
  return bytesToHex(encodeFalconSignature(nobleSig))
}

export function generateFalconEthKeypair(): {
  publicKeyHex: Hex
  secretKeyHex: Hex
  encodedPublicKey: Hex
} {
  const { publicKey, secretKey } = falcon512paddedEth.keygen()

  return {
    publicKeyHex: bytesToHex(publicKey),
    secretKeyHex: bytesToHex(secretKey),
    encodedPublicKey: encodePublicKeyForZKNOX(publicKey),
  }
}

export function signFalconEth(secretKeyHex: Hex, messageHashHex: Hex): Hex {
  const signature = falcon512paddedEth.sign(hexToBytes(messageHashHex), hexToBytes(secretKeyHex))
  return encodeSignatureForZKNOX(signature)
}
