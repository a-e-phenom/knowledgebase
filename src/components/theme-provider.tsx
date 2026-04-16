/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

const STORAGE_KEY = "vite-ui-theme-v2"

type ThemeProviderProps = {
  children: React.ReactNode
}

const ThemeProviderContext = React.createContext<
  { theme: "light"; setTheme: (t: "light") => void } | undefined
>(undefined)

/** App is light-only; no dark mode or system preference. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove("dark")
    root.classList.add("light")
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const value = React.useMemo(
    () => ({
      theme: "light" as const,
      setTheme: () => {
        /* no-op — theme is fixed */
      },
    }),
    [],
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
