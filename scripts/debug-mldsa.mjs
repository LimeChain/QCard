import { ml_dsa44eth } from "@noble/post-quantum/ml-dsa.js"
import { encodeMlDsaPublicKey, keccakXofFactory } from "@noble/post-quantum/utils-eth.js"
import { bytesToHex } from "viem"

const { publicKey, secretKey } = ml_dsa44eth.keygen()

const msg = new Uint8Array(32)
for (let i = 0; i < 32; i++) msg[i] = i + 1

const sig = ml_dsa44eth.sign(msg, secretKey)
const ok = ml_dsa44eth.verify(sig, msg, publicKey)

const encodedPk = encodeMlDsaPublicKey(publicKey, keccakXofFactory, keccakXofFactory)

console.log(JSON.stringify({
  rawPkLen: publicKey.length,
  encodedPkLen: encodedPk.length,
  sigLen: sig.length,
  sigHead: bytesToHex(sig.slice(0, 8)),
  sigTail: bytesToHex(sig.slice(-8)),
  selfVerify: ok,
  msgHex: bytesToHex(msg),
}, null, 2))
