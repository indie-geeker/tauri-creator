import { describe, expect, it } from 'vitest'
import { availableLanguages, isRTL } from './config'

describe('i18n config', () => {
  it('exposes only English and Simplified Chinese', () => {
    expect(availableLanguages).toEqual(['en', 'zh-CN'])
  })

  it('does not mark supported languages as RTL', () => {
    expect(isRTL('en')).toBe(false)
    expect(isRTL('zh-CN')).toBe(false)
  })
})
