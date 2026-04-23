export const mockKeypair = {
  encryptedSeedBlob: "U2FsdGVkX1+vP4mC0Gz+sA==", // fake base64
  maskedSeed: "0x8a3f...d49a",
  authRoot:
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  leafCount: 16,
  schemes: [
    { type: "Lamport", count: 8 },
    { type: "Falcon", count: 5 },
    { type: "ECDSA", count: 3 },
  ],
  leaves: Array.from({ length: 16 }).map((_, index) => ({
    index,
    scheme: index < 8 ? "Lamport" : index < 13 ? "Falcon" : "ECDSA",
    used: false,
  })),
};

export const mockDeployment = {
  hcaAccount: "0x78ab12D4CFe8Ca9562...3B2",
  hcaFactory: "0x14041b6B7B4b39A019...2B3",
  lamportVerifier: "0x0A2B3C4D5E6F789...",
  falconVerifier: "0x1B2C3D4E5F6A7B8...",
  txHash: "0xabcd1234efgh5678ijkl...",
};

export const mockTransactions = {
  targetAddress: "0x00DAd79148139E3B711c12630221b23F386aDFc9",
  fundAmount: "0.01",
  signatureHex: "0x0000000000000000000000000000...",
  userOpHash: "0x9876543210fedcba9876543210fedcba...",
  txHash: "0x234567890abcdef1...",
};

export const mockTreeNodes = [
  { id: "root", label: "0x1234...cdef", isLeaf: false },
  // Just placeholders for the viz
];
