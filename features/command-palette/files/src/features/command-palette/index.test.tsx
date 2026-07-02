import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommandPalettePanel } from './index'

describe('CommandPalettePanel', () => {
  it('stays hidden until opened or queried', () => {
    const html = renderToStaticMarkup(
      <CommandPalettePanel
        commands={[
          {
            id: 'app:status',
            title: 'Show app status',
            run: () => {},
          },
        ]}
      />
    )

    expect(html).toBe('')
  })

  it('renders matching commands for a query', () => {
    const html = renderToStaticMarkup(
      <CommandPalettePanel
        commands={[
          {
            id: 'diagnostics:export',
            title: 'Export diagnostics',
            keywords: ['support'],
            run: () => {},
          },
          {
            id: 'preferences:open',
            title: 'Open preferences',
            keywords: ['settings'],
            run: () => {},
          },
        ]}
        query="support"
      />
    )

    expect(html).toContain('Export diagnostics')
    expect(html).not.toContain('Open preferences')
  })
})
