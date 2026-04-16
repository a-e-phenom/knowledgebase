declare module '@joplin/turndown' {
  class TurndownService {
    constructor(options?: Record<string, any>)
    use(plugins: any | any[]): this
    addRule(key: string, rule: any): this
    turndown(html: string): string
  }
  export = TurndownService
}

declare module '@joplin/turndown-plugin-gfm' {
  export const tables: any
  export const strikethrough: any
  export const highlightedCodeBlock: any
  export const taskListItems: any
}
