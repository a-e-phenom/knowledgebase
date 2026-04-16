import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import Underline from '@tiptap/extension-underline'
import Typography from '@tiptap/extension-typography'
import CharacterCount from '@tiptap/extension-character-count'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Youtube from '@tiptap/extension-youtube'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { common, createLowlight } from 'lowlight'
import { MarkdownClipboard } from '@/components/MarkdownClipboard'
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useState,
} from 'react'
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon,
  Code, Heading1, Heading2, Heading3, Link as LinkIcon,
  Highlighter, List, ListOrdered, CheckSquare, Quote,
  Terminal, Minus, Table as TableIcon, Image as ImageIcon,
} from 'lucide-react'

const lowlight = createLowlight(common)

// ─── Slash menu items ─────────────────────────────────────────────────────────

type SlashItem = {
  title: string
  description: string
  icon: React.ReactNode
  command: (props: { editor: any; range: any }) => void
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text', description: 'Plain paragraph', icon: <span className="slash-icon-text">¶</span>,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').run(),
  },
  {
    title: 'Heading 1', description: 'Big section heading', icon: <Heading1 size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2', description: 'Medium section heading', icon: <Heading2 size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3', description: 'Small section heading', icon: <Heading3 size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list', description: 'Simple bullet list', icon: <List size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list', description: 'List with numbering', icon: <ListOrdered size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do list', description: 'Track tasks with checkboxes', icon: <CheckSquare size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Quote', description: 'Block quote', icon: <Quote size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code', description: 'Syntax-highlighted code block', icon: <Terminal size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider', description: 'Horizontal rule', icon: <Minus size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Table', description: 'Insert a table', icon: <TableIcon size={16} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Image', description: 'Insert image by URL', icon: <ImageIcon size={16} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
      const url = window.prompt('Image URL:')
      if (url) editor.chain().focus().setImage({ src: url }).run()
    },
  },
]

// ─── Slash menu list component ────────────────────────────────────────────────

type SlashMenuListProps = {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

const SlashMenuList = forwardRef<{ onKeyDown: (e: { event: KeyboardEvent }) => boolean }, SlashMenuListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          command(items[selectedIndex])
          return true
        }
        return false
      },
    }))

    if (!items.length) {
      return (
        <div className="slash-menu">
          <div className="slash-menu-empty">No results</div>
        </div>
      )
    }

    return (
      <div className="slash-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-menu-item ${i === selectedIndex ? 'selected' : ''}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onMouseDown={(e) => { e.preventDefault(); command(item) }}
          >
            <span className="slash-menu-icon">{item.icon}</span>
            <span className="slash-menu-text">
              <span className="slash-menu-title">{item.title}</span>
              <span className="slash-menu-desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    )
  }
)
SlashMenuList.displayName = 'SlashMenuList'

// ─── Slash menu renderer using createPortal ───────────────────────────────────

function renderItems() {
  let component: React.RefObject<any> | null = null
  let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null
  let container: HTMLElement | null = null
  let popup: any = null

  return {
    onStart: (props: any) => {
      component = { current: null }
      container = document.createElement('div')
      document.body.appendChild(container)

      import('react-dom/client').then(({ createRoot }) => {
        root = createRoot(container!)
        const update = (p: any) => {
          root!.render(
            <SlashMenuList
              ref={component}
              items={p.items}
              command={(item: SlashItem) => item.command({ editor: p.editor, range: p.range })}
            />
          )
        }
        update(props)

        import('tippy.js').then(({ default: tippy }) => {
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: container!,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            arrow: false,
            offset: [0, 4],
            popperOptions: { strategy: 'fixed' },
          })
          ;(renderItems as any).__update = update
        })
      })
    },

    onUpdate: (props: any) => {
      ;(renderItems as any).__update?.(props)
      popup?.[0]?.setProps?.({ getReferenceClientRect: props.clientRect })
    },

    onKeyDown: (props: any) => {
      if (props.event.key === 'Escape') {
        popup?.[0]?.hide?.()
        return true
      }
      return component?.current?.onKeyDown(props) ?? false
    },

    onExit: () => {
      popup?.[0]?.destroy?.()
      popup = null
      root?.unmount()
      root = null
      container?.remove()
      container = null
      component = null
      delete (renderItems as any).__update
    },
  }
}

// ─── Slash command extension ──────────────────────────────────────────────────

const slashPluginKey = new PluginKey('slash-command')

const SlashCommand = Extension.create({
  name: 'slash-command',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: slashPluginKey,
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range })
        },
        allow: ({ state, range }: any) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashPluginKey,
        char: '/',
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return SLASH_ITEMS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q),
          )
        },
        render: renderItems,
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range })
        },
        allow: ({ state, range }: any) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
      }),
    ]
  },
})

// ─── BlockEditor component ────────────────────────────────────────────────────

type BlockEditorProps = {
  content: string
  onUpdate: (content: string) => void
  placeholder?: string
}

export function BlockEditor({
  content,
  onUpdate,
  placeholder = "Write something, or type '/' for commands…",
}: BlockEditorProps) {
  const addLink = useCallback((editor: any) => {
    const prev = editor.getAttributes('link').href ?? ''
    const url = window.prompt('URL:', prev)
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
          return placeholder
        },
        includeChildren: true,
      }),
      Link.configure({ openOnClick: false }),
      Image.configure({ HTMLAttributes: { class: 'docmost-image' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      Underline,
      Typography,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({ controls: true, nocookie: true }),
      CodeBlockLowlight.configure({ lowlight }),
      CharacterCount,
      GlobalDragHandle.configure({ dragHandleWidth: 20 }),
      SlashCommand,
      MarkdownClipboard.configure({ transformPastedText: true }),
    ],
    content,
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
    editorProps: {
      attributes: { class: 'docmost-editor' },
    },
  })

  if (!editor) return null

  return (
    <div className="docmost-editor-wrap">
      <BubbleMenu editor={editor} className="docmost-bubble-menu">
        <button className={`bubble-btn${editor.isActive('bold') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} title="Bold"><Bold size={14} /></button>
        <button className={`bubble-btn${editor.isActive('italic') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} title="Italic"><Italic size={14} /></button>
        <button className={`bubble-btn${editor.isActive('underline') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} title="Underline"><UnderlineIcon size={14} /></button>
        <button className={`bubble-btn${editor.isActive('strike') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }} title="Strike"><Strikethrough size={14} /></button>
        <button className={`bubble-btn${editor.isActive('code') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run() }} title="Code"><Code size={14} /></button>
        <button className={`bubble-btn${editor.isActive('highlight') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight().run() }} title="Highlight"><Highlighter size={14} /></button>
        <div className="bubble-sep" />
        <button className={`bubble-btn${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }} title="H1"><Heading1 size={14} /></button>
        <button className={`bubble-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }} title="H2"><Heading2 size={14} /></button>
        <button className={`bubble-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }} title="H3"><Heading3 size={14} /></button>
        <div className="bubble-sep" />
        <button className={`bubble-btn${editor.isActive('link') ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); addLink(editor) }} title="Link"><LinkIcon size={14} /></button>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  )
}
