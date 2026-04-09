import * as React from "react"
import { Button } from "../ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/Card"
import { Input } from "../ui/Input"
import { Copy, ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useWizard } from "@/lib/store"
import { useBalance, useSendTransaction, useWaitForTransactionReceipt } from "wagmi"
import { parseEther, formatEther } from "viem"

export function Fund({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  const wizard = useWizard()
  const accountAddress = wizard.deployedAddresses?.hcaAccount ?? ''
  const [fundAmount, setFundAmount] = React.useState("0.3")

  const {
    data: balanceData,
    refetch: refetchBalance,
    isLoading: isLoadingBalance,
  } = useBalance({
    address: accountAddress as `0x${string}` | undefined,
    query: { enabled: !!accountAddress },
  })

  const {
    sendTransaction,
    data: txHash,
    isPending: isSending,
    error: sendError,
  } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  React.useEffect(() => {
    if (isConfirmed) {
      refetchBalance()
    }
  }, [isConfirmed, refetchBalance])

  const balance = balanceData ? formatEther(balanceData.value) : '0.00'
  const hasFunds = balanceData ? balanceData.value > BigInt(0) : false

  const handleCopy = () => {
    navigator.clipboard.writeText(accountAddress)
  }

  const handleFund = () => {
    if (!accountAddress || !fundAmount) return
    sendTransaction({
      to: accountAddress as `0x${string}`,
      value: parseEther(fundAmount),
    })
  }

  const isFunding = isSending || isConfirming

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fund Account</CardTitle>
          <CardDescription>Send testnet ETH to pay for transaction gas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
           <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white p-2 rounded-xl">
                 <QRCodeSVG value={accountAddress ? `ethereum:${accountAddress}` : ''} size={160} />
              </div>

              <div className="flex-1 space-y-4">
                 <div>
                   <label className="text-xs uppercase text-muted tracking-wider mb-1 block">Account Address</label>
                   <div className="flex gap-2">
                     <div className="font-mono text-sm bg-[#161b22] px-3 py-2 rounded-md border border-border flex-1 break-all">
                       {accountAddress || 'Not deployed yet'}
                     </div>
                     <Button variant="outline" size="default" className="shrink-0 group hover:border-accent" onClick={handleCopy} title="Copy Address" disabled={!accountAddress}>
                       <Copy className="w-4 h-4 text-muted group-hover:text-accent" />
                     </Button>
                   </div>
                 </div>

                 <div>
                   <div className="flex justify-between items-center mb-1">
                     <label className="text-xs uppercase text-muted tracking-wider block">Balance (Sepolia)</label>
                     <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetchBalance()} disabled={isLoadingBalance}>
                       <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                     </Button>
                   </div>
                   <div className="flex items-center gap-3 bg-[#161b22] px-4 py-3 rounded-md border border-border">
                     <span className="font-mono text-xl">{balance}</span>
                     <span className="text-muted">ETH</span>
                     {hasFunds && (
                       <CheckCircle2 className="w-5 h-5 text-success ml-auto animate-in zoom-in" />
                     )}
                   </div>
                 </div>
              </div>
           </div>

           {sendError && (
             <p className="text-sm text-red-400">{sendError.message}</p>
           )}

           <div className="flex flex-col gap-3 border-t border-border pt-6">
             <div className="flex gap-3 items-end">
               <div className="flex-1 space-y-1">
                 <label className="text-xs text-muted">Amount (ETH)</label>
                 <Input
                   type="text"
                   value={fundAmount}
                   onChange={(e) => setFundAmount(e.target.value)}
                   placeholder="0.01"
                 />
               </div>
               <Button size="lg" onClick={handleFund} disabled={isFunding || !accountAddress || !fundAmount}>
                  {isFunding
                    ? <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : null
                  }
                  {isFunding ? (isConfirming ? "Confirming..." : "Sending...") : `Send ${fundAmount} ETH`}
               </Button>
             </div>
             {isFunding && (
               <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-[#161b22]">
                 <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                 <p className="text-xs text-muted">
                   {isSending ? 'Requesting wallet signature...' : isConfirming ? `Waiting for confirmation... ${txHash ? txHash.slice(0, 18) + '...' : ''}` : 'Processing...'}
                 </p>
               </div>
             )}
             <p className="text-[11px] text-muted">
               <strong>Minimum:</strong> 0.3 ETH. The bundler&apos;s gas estimation simulates at up to 10M verification gas, so the upfront prefund check can be ~0.1 ETH even though the real PQC verification only uses ~2M gas. Lower balances can trigger <code className="text-[10px] bg-[#161b22] px-1 rounded">AA21 didn&apos;t pay prefund</code>.
             </p>
             {hasFunds && !isFunding && (
               <p className="text-xs text-green-400 text-center">Account is funded. You can send more or proceed to the next step.</p>
             )}
           </div>

        </CardContent>
      </Card>

      <div className="flex justify-between">
         <Button variant="ghost" onClick={onBack}>Back</Button>
         <Button size="lg" disabled={!hasFunds} onClick={onNext}>Next: Sign & Submit</Button>
      </div>
    </div>
  )
}
