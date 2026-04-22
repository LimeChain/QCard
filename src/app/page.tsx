"use client"

import * as React from "react"
import { StepIndicator } from "@/components/StepIndicator"
import { ConfigureAccount } from "@/components/steps/ConfigureAccount"
import { GenerateKeys } from "@/components/steps/GenerateKeys"
import { Deploy } from "@/components/steps/Deploy"
import { Fund } from "@/components/steps/Fund"
import { SignSubmit } from "@/components/steps/SignSubmit"
import { Verify } from "@/components/steps/Verify"
import { WizardProvider, useWizard } from "@/lib/store"
import { Button } from "@/components/ui/Button"
import { RotateCcw } from "lucide-react"

const HCA_STEP_KEY = 'hca-wizard-step'
const PQC_STEP_KEY = 'pqc4337-wizard-step'

function WizardContent() {
  const [currentStep, setCurrentStep] = React.useState(0)
  const [hydrated, setHydrated] = React.useState(false)
  const wizard = useWizard()
  const stepKey = wizard.activeFlow === "pqc4337" ? PQC_STEP_KEY : HCA_STEP_KEY

  // Restore step from localStorage AFTER hydration to avoid SSR mismatch
  React.useEffect(() => {
    const saved = localStorage.getItem(stepKey)
    const parsed = saved ? parseInt(saved, 10) : 0
    setCurrentStep(Number.isFinite(parsed) ? Math.min(parsed, 5) : 0)
    setHydrated(true)
  }, [stepKey])

  React.useEffect(() => {
    if (hydrated) localStorage.setItem(stepKey, String(currentStep))
  }, [currentStep, hydrated, stepKey])

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 5))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const handleReset = () => {
    if (wizard.activeFlow === "pqc4337") {
      wizard.resetPqc4337()
      localStorage.removeItem(PQC_STEP_KEY)
    } else {
      wizard.reset()
      localStorage.removeItem(HCA_STEP_KEY)
    }
    setCurrentStep(0)
  }

  const flowTitle = wizard.activeFlow === "pqc4337" ? "PQC-4337 Console" : "Quantum-Resistant Interactive Console"
  const flowSubtitle = wizard.activeFlow === "pqc4337"
    ? "Scheme-specific Falcon-ETH / ML-DSA-ETH smart account flow"
    : "Quantum-resistant Smart Account Deployment & Management"

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{flowTitle}</h1>
            <p className="text-muted">{flowSubtitle}</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{flowTitle}</h1>
          <p className="text-muted">{flowSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => wizard.setActiveFlow("hca")}
            className={`text-left border rounded-lg p-4 transition-colors ${wizard.activeFlow === "hca" ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent/50"}`}
          >
            <p className="text-sm font-semibold">HCA Flow</p>
            <p className="text-xs text-muted mt-1">Existing Merkle-based multi-scheme account flow.</p>
          </button>
          <button
            type="button"
            onClick={() => wizard.setActiveFlow("pqc4337")}
            className={`text-left border rounded-lg p-4 transition-colors ${wizard.activeFlow === "pqc4337" ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent/50"}`}
          >
            <p className="text-sm font-semibold">PQC-4337 Flow</p>
            <p className="text-xs text-muted mt-1">Scheme-specific Falcon-ETH / ML-DSA-ETH account flow.</p>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <StepIndicator currentStepIndex={currentStep} flowMode={wizard.activeFlow} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title="Start over"
            className="text-muted hover:text-red-400 shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="mt-8 transition-all duration-300">
          {currentStep === 0 && <ConfigureAccount onNext={handleNext} />}
          {currentStep === 1 && <GenerateKeys onNext={handleNext} onBack={handleBack} />}
          {currentStep === 2 && <Deploy onNext={handleNext} onBack={handleBack} />}
          {currentStep === 3 && <Fund onNext={handleNext} onBack={handleBack} />}
          {currentStep === 4 && <SignSubmit onNext={handleNext} onBack={handleBack} />}
          {currentStep === 5 && (
            <Verify
              onNext={handleNext}
              onBack={handleBack}
              setCurrentStep={setCurrentStep}
            />
          )}
        </div>

      </div>
    </main>
  )
}

export default function Home() {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  )
}
