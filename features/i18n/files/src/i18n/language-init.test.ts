import { describe, expect, it } from 'vitest'
import { resolveLanguagePreference } from './language-init'

describe('resolveLanguagePreference', () => {
  it('uses explicit supported language preferences', () => {
    expect(resolveLanguagePreference('en', 'zh-CN')).toBe('en')
    expect(resolveLanguagePreference('zh-CN', 'en-US')).toBe('zh-CN')
  })

  it('maps Chinese system locales to Simplified Chinese', () => {
    expect(resolveLanguagePreference('system', 'zh-CN')).toBe('zh-CN')
    expect(resolveLanguagePreference(null, 'zh-Hans-CN')).toBe('zh-CN')
    expect(resolveLanguagePreference(undefined, 'zh-TW')).toBe('zh-CN')
  })

  it('maps English system locales to English', () => {
    expect(resolveLanguagePreference('system', 'en-US')).toBe('en')
  })

  it('falls back to English for unsupported preferences and locales', () => {
    expect(resolveLanguagePreference('fr', 'zh-CN')).toBe('en')
    expect(resolveLanguagePreference('system', 'fr-FR')).toBe('en')
    expect(resolveLanguagePreference('system', null)).toBe('en')
  })
})
