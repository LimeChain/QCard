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

const STEP_KEY = 'hca-wizard-step'

function WizardContent() {
  const [currentStep, setCurrentStep] = React.useState(0)
  const [hydrated, setHydrated] = React.useState(false)
  const wizard = useWizard()

  // Restore step from localStorage AFTER hydration to avoid SSR mismatch
  React.useEffect(() => {
    const saved = localStorage.getItem(STEP_KEY)
    if (saved) setCurrentStep(Math.min(parseInt(saved, 10), 5))
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (hydrated) localStorage.setItem(STEP_KEY, String(currentStep))
  }, [currentStep, hydrated])

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 5))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const handleReset = () => {
    wizard.reset()
    setCurrentStep(0)
    localStorage.removeItem(STEP_KEY)
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">HCA Interactive Console</h1>
          <p className="text-muted">Quantum-resistant Smart Account Deployment & Management</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <StepIndicator currentStepIndex={currentStep} />
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
