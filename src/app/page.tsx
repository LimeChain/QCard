"use client"

import * as React from "react"
import { StepIndicator } from "@/components/StepIndicator"
import { ConfigureAccount } from "@/components/steps/ConfigureAccount"
import { GenerateKeys } from "@/components/steps/GenerateKeys"
import { Deploy } from "@/components/steps/Deploy"
import { Fund } from "@/components/steps/Fund"
import { SignSubmit } from "@/components/steps/SignSubmit"
import { Verify } from "@/components/steps/Verify"
import { WizardProvider } from "@/lib/store"

export default function Home() {
  const [currentStep, setCurrentStep] = React.useState(0)

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 5))
  }

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  return (
    <WizardProvider>
      <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-3xl space-y-8">

          <div className="text-center space-y-2">
             <h1 className="text-3xl font-bold tracking-tight">HCA Interactive Console</h1>
             <p className="text-muted">Quantum-resistant Smart Account Deployment & Management</p>
          </div>

          <StepIndicator currentStepIndex={currentStep} />

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
    </WizardProvider>
  )
}
