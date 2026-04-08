import * as React from "react"
import { cn } from "@/lib/utils"

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, ...props }, ref) => {
    return (
      <div className={cn("relative rounded-md bg-[#161b22] p-4 text-sm max-w-full overflow-x-auto border border-border shadow-inner", className)}>
        <pre ref={ref} {...props}>
          <code className="font-mono text-[#c9d1d9]">{code}</code>
        </pre>
      </div>
    )
  }
)
CodeBlock.displayName = "CodeBlock"

export { CodeBlock }
