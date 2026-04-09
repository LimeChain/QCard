/**
 * POST /api/falcon/sign
 *
 * Deterministic Falcon signing for HCA UserOperations.
 * Shells out to falcon_service.py which wraps ZKNox ETHFALCON's pythonref signer.
 *
 * Body: { seed: hex, message: hex }
 *   - seed:    48-byte hex seed derived from user's master seed (same used at keygen)
 *   - message: hex-encoded message to sign (typically the userOpHash)
 *
 * Returns: {
 *   pkCompact: `0x${string}`[],  // 32 uint256 words (matches keygen output)
 *   salt:      `0x${string}`,    // 40-byte salt
 *   s2Compact: `0x${string}`[],  // 32 uint256 words
 * }
 *
 * The browser assembles sigData = abi.encode(salt, s2Compact, pkCompact)
 * and feeds it to the HCA account's validateUserOp flow.
 */

import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'

const APP_ROOT = process.cwd()
const PYTHON = path.join(APP_ROOT, 'contracts/lib/ETHFALCON/pythonref/myenv/bin/python')
const SCRIPT = path.join(APP_ROOT, 'scripts/falcon_service.py')

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT, ...args], {
      cwd: APP_ROOT,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`falcon_service.py exited ${code}: ${stderr}`))
      } else {
        resolve(stdout)
      }
    })
    child.on('error', reject)
  })
}

function validateHex(input: unknown, minBytes: number, name: string): string {
  if (typeof input !== 'string') throw new Error(`${name} must be a hex string`)
  const clean = input.startsWith('0x') ? input.slice(2) : input
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`${name} has invalid hex characters`)
  if (clean.length < minBytes * 2) {
    throw new Error(`${name} must be at least ${minBytes} bytes`)
  }
  return clean
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { seed?: string; message?: string }
    const seedHex = validateHex(body.seed, 32, 'seed')
    const messageHex = validateHex(body.message, 1, 'message')

    const stdout = await runPython(['sign', seedHex, messageHex])
    const parsed = JSON.parse(stdout) as {
      pkCompact: string[]
      salt: string
      s2Compact: string[]
    }

    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
