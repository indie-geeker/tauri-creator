import { describe, expect, it } from 'vitest'

describe('base app', () => {
  it('keeps the app name available to the template', () => {
    expect('{{APP_TITLE}}').toContain('{{APP_TITLE}}')
  })
})
