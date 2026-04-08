import * as React from "react"
import { cn } from "@/lib/utils"

export type StepState = "completed" | "current" | "pending"
export type StepDefinition = { title: string; id: string }

export const STEPS: StepDefinition[] = [
  { id: "configure", title: "Configure Account" },
  { id: "keys", title: "Generate Keys" },
  { id: "deploy", title: "Deploy" },
  { id: "fund", title: "Fund" },
  { id: "sign", title: "Sign & Submit" },
  { id: "verify", title: "Verify" },
]

export interface StepIndicatorProps {
  currentStepIndex: number
}

export function StepIndicator({ currentStepIndex }: StepIndicatorProps) {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between w-full relative">
        {STEPS.map((step, index) => {
          let state: StepState = "pending"
          if (index < currentStepIndex) state = "completed"
          else if (index === currentStepIndex) state = "current"

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-300",
                    {
                      "bg-accent border-accent text-white": state === "completed",
                      "bg-transparent border-accent text-accent shadow-[0_0_10px_rgba(88,166,255,0.5)]": state === "current",
                      "bg-card border-border text-muted": state === "pending",
                    }
                  )}
                >
                  {state === "completed" ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "absolute top-10 text-xs w-24 text-center font-medium transition-colors duration-300",
                    {
                      "text-foreground": state === "completed" || state === "current",
                      "text-muted": state === "pending",
                    }
                  )}
                >
                  {step.title}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-border relative z-0">
                  <div
                    className="absolute top-0 left-0 h-full bg-accent transition-all duration-300"
                    style={{ width: index < currentStepIndex ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
