/**
 * POST /api/falcon/keygen
 *
 * Deterministic Falcon public key generation for HCA leaves.
 * Shells out to falcon_service.py which wraps ZKNox ETHFALCON's pythonref signer.
 *
 * Body: { seed: hex }   — 48-byte hex seed derived from the user's master seed
 * Returns: { pkCompact: `0x${string}`[] } — 32 uint256 words (NTT-compacted)
 *
 * Used at keygen time to commit to a Falcon leaf in the HCA Merkle tree.
 * Same seed → same pkCompact, so signing later will produce a matching public key.
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

function validateHex(input: unknown, minBytes: number): string {
  if (typeof input !== 'string') throw new Error('expected hex string')
  const clean = input.startsWith('0x') ? input.slice(2) : input
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('invalid hex characters')
  if (clean.length < minBytes * 2) {
    throw new Error(`expected at least ${minBytes} bytes, got ${clean.length / 2}`)
  }
  return clean
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { seed?: string }
    const seedHex = validateHex(body.seed, 32)

    const stdout = await runPython(['keygen', seedHex])
    const parsed = JSON.parse(stdout) as { pkCompact: string[] }

    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
