import * as React from "react";
import { Button } from "../ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import { Input } from "../ui/Input";
import { Alert, AlertDescription, AlertTitle } from "../ui/Alert";
import {
  ArrowRight,
  KeyRound,
  Server,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useWizard } from "@/lib/store";
import { useAccount, usePublicClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { config } from "@/lib/wagmi";
import { encodeFunctionData, parseEther, toHex as viemToHex } from "viem";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { entryPointV07Abi, pqcAccountAbi } from "@/lib/contracts/abis";
import {
  sendUserOperationV07,
  getUserOperationReceipt,
  getPimlicoGasPrice,
  estimateUserOpGasV07,
  type UserOperationV07,
} from "@/lib/bundler/pimlico";
import {
  getUserOpHashV07,
  packAccountGasLimits,
  packGasFees,
} from "@/lib/bundler/userop-v07";
import { signFalconEth, signMlDsaEth } from "@/lib/crypto";
import { toFriendlyUiError, type FriendlyUiError } from "@/lib/friendly-error";

const CALL_GAS = BigInt(500_000);
const VERIFICATION_GAS_FALCON = BigInt(3_000_000);
const VERIFICATION_GAS_MLDSA = BigInt(7_000_000);
const DEFAULT_PRE_VERIFICATION_GAS = BigInt(120_000);

function addPreVerificationGasHeadroom(required: bigint): bigint {
  const tenPercent = required / BigInt(10);
  const floor = BigInt(10_000);
  return required + (tenPercent > floor ? tenPercent : floor);
}

function addExecutionGasHeadroom(required: bigint): bigint {
  const tenPercent = required / BigInt(10);
  const floor = BigInt(100_000);
  return required + (tenPercent > floor ? tenPercent : floor);
}

export function PqcSignSubmit({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const wizard = useWizard();
  const { address: walletAddress } = useAccount();
  const publicClient = usePublicClient();

  const [toAddress, setToAddress] = React.useState(
    "0x00DAd79148139E3B711c12630221b23F386aDFc9",
  );
  const [amount, setAmount] = React.useState("0.001");
  const [isSigning, setIsSigning] = React.useState(false);
  const [signStatus, setSignStatus] = React.useState("");
  const [signatureHex, setSignatureHex] = React.useState("");
  const [builtUserOp, setBuiltUserOp] = React.useState<UserOperationV07 | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitStatus, setSubmitStatus] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [userOpHashResult, setUserOpHashResult] = React.useState("");
  const [error, setError] = React.useState<FriendlyUiError | null>(null);
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);

  const envPimlicoKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY ?? "";
  const [pimlicoKey] = React.useState(
    wizard.pqc4337.pimlicoApiKey || envPimlicoKey,
  );
  const hasBundler = pimlicoKey.length > 0;

  const clearError = () => {
    setError(null);
    setShowErrorDetails(false);
  };

  const setFriendlyError = (err: unknown, fallbackMessage: string) => {
    setError(toFriendlyUiError(err, { fallbackMessage }));
    setShowErrorDetails(false);
  };

  const accountAddr = wizard.pqc4337.deployment?.accountAddress ?? "";
  const keypair = wizard.pqc4337.keypair;

  const handleSign = async () => {
    clearError();
    setIsSigning(true);
    setSignStatus("Building UserOperation...");
    try {
      if (!publicClient) throw new Error("Public client not initialized.");
      if (!accountAddr)
        throw new Error("No deployed PQC account found. Go back to Deploy.");
      if (!keypair)
        throw new Error("No PQC keypair found. Go back to Generate.");

      const callData = encodeFunctionData({
        abi: pqcAccountAbi,
        functionName: "execute",
        args: [toAddress as `0x${string}`, parseEther(amount), "0x"],
      });

      const onChainNonce = await publicClient.readContract({
        address: accountAddr as `0x${string}`,
        abi: pqcAccountAbi,
        functionName: "nonce",
      });

      let maxFee: bigint;
      let maxPrio: bigint;
      if (pimlicoKey) {
        try {
          const gp = await getPimlicoGasPrice(pimlicoKey, 11155111);
          maxFee = BigInt(gp.maxFeePerGas);
          maxPrio = BigInt(gp.maxPriorityFeePerGas);
        } catch {
          const block = await publicClient.getBlock();
          const baseFee = block.baseFeePerGas ?? BigInt(1_000_000_000);
          maxFee = (baseFee * BigInt(3)) / BigInt(2) + BigInt(1_000_000_000);
          maxPrio = BigInt(1_000_000_000);
        }
      } else {
        const block = await publicClient.getBlock();
        const baseFee = block.baseFeePerGas ?? BigInt(1_000_000_000);
        maxFee = (baseFee * BigInt(3)) / BigInt(2) + BigInt(1_000_000_000);
        maxPrio = BigInt(1_000_000_000);
      }

      const buildSignedUserOp = async (
        preVerificationGas: bigint,
        callGasLimit: bigint,
        verificationGasLimit: bigint,
      ): Promise<{ userOp: UserOperationV07; userOpHash: `0x${string}` }> => {
        const unsigned: UserOperationV07 = {
          sender: accountAddr as `0x${string}`,
          nonce: viemToHex(BigInt(onChainNonce as bigint)),
          initCode: "0x",
          callData: callData as `0x${string}`,
          accountGasLimits: packAccountGasLimits(
            callGasLimit,
            verificationGasLimit,
          ),
          preVerificationGas: viemToHex(preVerificationGas),
          gasFees: packGasFees(maxFee, maxPrio),
          paymasterAndData: "0x",
          signature: "0x",
        };
        const userOpHash = getUserOpHashV07(
          unsigned,
          11155111,
          ADDRESSES.entryPointV07,
        );
        setSignStatus(`Signing ${wizard.pqc4337.scheme} in browser...`);
        const signature =
          wizard.pqc4337.scheme === "falcon-eth"
            ? signFalconEth(keypair.secretKeyHex, userOpHash)
            : signMlDsaEth(keypair.secretKeyHex, userOpHash);
        return { userOp: { ...unsigned, signature }, userOpHash };
      };

      const initialVerificationGas =
        wizard.pqc4337.scheme === "falcon-eth"
          ? VERIFICATION_GAS_FALCON
          : VERIFICATION_GAS_MLDSA;
      let signed = await buildSignedUserOp(
        DEFAULT_PRE_VERIFICATION_GAS,
        CALL_GAS,
        initialVerificationGas,
      );
      if (pimlicoKey) {
        setSignStatus("Calibrating bundler gas limits...");
        const est = await estimateUserOpGasV07(
          signed.userOp,
          pimlicoKey,
          11155111,
          ADDRESSES.entryPointV07,
        );
        const bufferedPreVerificationGas = addPreVerificationGasHeadroom(
          BigInt(est.preVerificationGas),
        );
        const bufferedCallGasLimit = addExecutionGasHeadroom(
          BigInt(est.callGasLimit),
        );
        const bufferedVerificationGasLimit = addExecutionGasHeadroom(
          BigInt(est.verificationGasLimit),
        );

        const currentPackedGas = signed.userOp.accountGasLimits;
        const currentCallGasLimit =
          BigInt(currentPackedGas) &
          ((BigInt(1) << BigInt(128)) - BigInt(1));
        const currentVerificationGasLimit =
          BigInt(currentPackedGas) >> BigInt(128);

        if (
          bufferedPreVerificationGas > BigInt(signed.userOp.preVerificationGas) ||
          bufferedCallGasLimit > currentCallGasLimit ||
          bufferedVerificationGasLimit > currentVerificationGasLimit
        ) {
          signed = await buildSignedUserOp(
            bufferedPreVerificationGas,
            bufferedCallGasLimit > currentCallGasLimit
              ? bufferedCallGasLimit
              : currentCallGasLimit,
            bufferedVerificationGasLimit > currentVerificationGasLimit
              ? bufferedVerificationGasLimit
              : currentVerificationGasLimit,
          );
        }
      }

      setSignStatus(
        "Pre-flight: verifying userOpHash against EntryPoint v0.7...",
      );
      try {
        const onChainHash = (await publicClient.readContract({
          address: ADDRESSES.entryPointV07,
          abi: entryPointV07Abi,
          functionName: "getUserOpHash",
          args: [
            {
              sender: signed.userOp.sender,
              nonce: BigInt(signed.userOp.nonce),
              initCode: signed.userOp.initCode,
              callData: signed.userOp.callData,
              accountGasLimits: signed.userOp.accountGasLimits,
              preVerificationGas: BigInt(signed.userOp.preVerificationGas),
              gasFees: signed.userOp.gasFees,
              paymasterAndData: signed.userOp.paymasterAndData,
              signature: "0x",
            },
          ],
        })) as `0x${string}`;
        if (onChainHash.toLowerCase() !== signed.userOpHash.toLowerCase()) {
          throw new Error(
            `UserOpHash mismatch (v0.7).\nLocal: ${signed.userOpHash}\nOn-chain: ${onChainHash}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("UserOpHash mismatch")) throw err;
      }

      setBuiltUserOp(signed.userOp);
      setSignatureHex(signed.userOp.signature);
      wizard.setPqc4337LastUserOpHash(signed.userOpHash);
    } catch (err) {
      setFriendlyError(err, "Could not build or sign the UserOperation.");
    } finally {
      setIsSigning(false);
      setSignStatus("");
    }
  };

  const handleSubmit = async () => {
    if (!builtUserOp || !signatureHex || !accountAddr) return;
    clearError();
    setIsSubmitting(true);
    const useBundler = pimlicoKey.length > 0;
    try {
      if (publicClient) {
        const bal = await publicClient.getBalance({
          address: accountAddr as `0x${string}`,
        });
        if (bal === BigInt(0))
          throw new Error("Account has 0 ETH. Fund it first.");
      }

      if (useBundler) {
        wizard.setPqc4337PimlicoApiKey(pimlicoKey);
        setSubmitStatus("Sending UserOperation to bundler...");
        const opHash = await sendUserOperationV07(
          builtUserOp,
          pimlicoKey,
          11155111,
          ADDRESSES.entryPointV07,
        );
        setUserOpHashResult(opHash);
        wizard.setPqc4337LastUserOpHash(opHash);

        setSubmitStatus("Waiting for on-chain confirmation...");
        const receipt = await getUserOperationReceipt(
          opHash,
          pimlicoKey,
          11155111,
        );
        if (!receipt?.transactionHash) {
          throw new Error(
            "Bundler accepted the UserOperation, but no on-chain receipt arrived before the polling timeout.",
          );
        }
        if (!receipt.success) {
          throw new Error(
            `UserOperation reached chain but execution failed: ${receipt.transactionHash}`,
          );
        }
        wizard.setPqc4337LastTxHash(receipt.transactionHash);
      } else {
        if (!walletAddress || !publicClient)
          throw new Error("Wallet client not ready.");
        const walletClient = await getWalletClient(config, {
          chainId: 11155111,
        });
        setSubmitStatus("Sending direct execution transaction...");
        const hash = await walletClient.writeContract({
          address: accountAddr as `0x${string}`,
          abi: pqcAccountAbi,
          functionName: "execute",
          args: [toAddress as `0x${string}`, parseEther(amount), "0x"],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        wizard.setPqc4337LastTxHash(hash);
        setUserOpHashResult(hash);
      }

      setSubmitted(true);
    } catch (err) {
      setFriendlyError(err, "Could not submit the transaction.");
    } finally {
      setIsSubmitting(false);
      setSubmitStatus("");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign & Submit (PQC-4337)</CardTitle>
          <CardDescription>
            Build UserOperation, sign in browser, and submit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">1. Transaction Details</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">To Address</label>
                <Input
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">Amount (ETH)</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium">2. Browser-side Signature</h4>
            <p className="text-xs text-muted">
              Scheme:{" "}
              <span className="text-foreground font-medium">
                {wizard.pqc4337.scheme}
              </span>
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSign}
              disabled={isSigning || !!signatureHex}
            >
              {isSigning ? (
                <div className="w-4 h-4 mr-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4 mr-2" />
              )}
              {isSigning
                ? "Signing..."
                : signatureHex
                  ? "Signed Successfully"
                  : "Sign UserOperation"}
            </Button>
            {isSigning && signStatus && (
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-xs text-muted">{signStatus}</p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium">3. Submit</h4>
            {hasBundler ? (
              <div className="p-3 border border-green-600/40 bg-green-900/10 rounded-lg flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-green-400">
                    ERC-4337 Bundler Mode
                  </p>
                  <p className="text-muted mt-0.5">
                    Pimlico submits your UserOperation to EntryPoint, which
                    verifies the PQC signature on-chain.
                  </p>
                  <p className="text-muted mt-1">
                    <strong>Who pays gas:</strong> your smart account pays from
                    its ETH balance (no paymaster in this flow). Pimlico relays
                    but does not sponsor gas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 border border-yellow-600/40 bg-yellow-900/10 rounded-lg flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-yellow-400">
                    Direct Wallet Mode
                  </p>
                  <p className="text-muted mt-0.5">
                    Without Pimlico key, the app calls{" "}
                    <code className="text-[10px] bg-[#161b22] px-1 rounded">
                      execute()
                    </code>{" "}
                    directly from your wallet.
                  </p>
                  <p className="text-muted mt-1">
                    <strong>Who pays gas:</strong> your connected wallet
                    (MetaMask EOA) pays gas directly for this transaction.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <Alert
                variant="destructive"
                className="border-red-500/40 bg-red-900/20 text-red-100"
              >
                <AlertTitle className="text-red-300">{error.title}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="text-sm text-red-100">{error.message}</p>
                  {error.action && (
                    <p className="text-xs text-red-200/90">{error.action}</p>
                  )}
                  {error.details && error.details !== error.message && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                        className="text-xs text-red-300 hover:text-red-200 underline inline-flex items-center gap-1"
                      >
                        {showErrorDetails ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        {showErrorDetails
                          ? "Hide technical details"
                          : "Show technical details"}
                      </button>
                      {showErrorDetails && (
                        <p className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all text-red-100/80">
                          {error.details}
                        </p>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={!signatureHex || isSubmitting || submitted}
            >
              {isSubmitting ? (
                <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Server className="w-4 h-4 mr-2" />
              )}
              {isSubmitting
                ? "Submitting..."
                : submitted
                  ? "Submitted"
                  : hasBundler
                    ? "Submit via Bundler (PQC verified)"
                    : "Direct Call (no bundler)"}
            </Button>
            {isSubmitting && submitStatus && (
              <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-xs text-muted">{submitStatus}</p>
              </div>
            )}
          </div>

          {submitted && (
            <div className="p-4 bg-success/10 border border-success/30 rounded-lg space-y-2 animate-in fade-in">
              <h4 className="text-sm font-semibold text-success flex items-center gap-2">
                <ArrowRight className="w-4 h-4" /> Transaction submitted
              </h4>
              <p className="text-xs font-mono break-all text-muted">
                {userOpHashResult}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" disabled={!submitted} onClick={onNext}>
          Next: Verify
        </Button>
      </div>
    </div>
  );
}
