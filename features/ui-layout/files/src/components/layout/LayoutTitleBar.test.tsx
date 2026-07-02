import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LayoutTitleBar } from './LayoutTitleBar'

describe('LayoutTitleBar', () => {
  it('renders a settings entry point', () => {
    const html = renderToStaticMarkup(<LayoutTitleBar />)

    expect(html).toContain('aria-label="Open settings"')
  })
})
