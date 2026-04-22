/**
 * Contract ABIs extracted from forge build output.
 * Only includes functions the UI actually calls.
 */

export const hcaFactoryAbi = [
  {
    type: 'function',
    name: 'createAccount',
    inputs: [
      { name: 'authRoot', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [
      { name: 'account', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAccountAddress',
    inputs: [
      { name: 'authRoot', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'authRoot', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
] as const

export const hcaAccountAbi = [
  {
    type: 'function',
    name: 'authRoot',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'validateUserOp',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'userOpHash', type: 'bytes32' },
      { name: 'missingAccountFunds', type: 'uint256' },
    ],
    outputs: [{ name: 'validationData', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'verifiers',
    inputs: [{ name: '', type: 'uint8' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

export const lamportVerifierAbi = [
  {
    type: 'function',
    name: 'verify',
    inputs: [
      { name: 'msgHash', type: 'bytes32' },
      { name: 'sigData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'pure',
  },
] as const

export const falconVerifierAbi = [
  {
    type: 'function',
    name: 'verify',
    inputs: [
      { name: 'msgHash', type: 'bytes32' },
      { name: 'sigData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export const pqcVerifierSetKeyAbi = [
  {
    type: 'function',
    name: 'setKey',
    inputs: [{ name: 'key', type: 'bytes' }],
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'nonpayable',
  },
] as const

export const pqcAccountAbi = [
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export const pqc4337FactoryAbi = [
  {
    type: 'event',
    name: 'FalconEthAccountCreated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'publicKeyPointer', type: 'bytes', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MlDsaEthAccountCreated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'publicKeyPointer', type: 'bytes', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'function',
    name: 'createFalconAccount',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createFalconAccountWithKey',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'encodedPublicKey', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [
      { name: 'account', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createMlDsaEthAccount',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createMlDsaEthAccountWithKey',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'encodedPublicKey', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [
      { name: 'account', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getFalconAccountAddress',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMlDsaEthAccountAddress',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'publicKeyPointer', type: 'bytes' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

/** Minimal EntryPoint v0.6 ABI — only the functions the UI needs. */
export const entryPointAbi = [
  {
    type: 'function',
    name: 'getUserOpHash',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const entryPointV07Abi = [
  {
    type: 'function',
    name: 'getUserOpHash',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
] as const
