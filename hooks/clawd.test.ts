import { expect, test } from 'claude-code/testing'

import { describe } from './clawd.mjs'

const BAND = (isWorking: boolean) => ({ component: 'AbovePrompt', props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 100 } as never }) as const

test('what it is doing, in a few words', () => {
  expect(describe({ tool: 'Edit', file_path: 'C:\\repo\\hooks\\mod-bar.mjs' })).toBe('Editing mod-bar.mjs')
  expect(describe({ tool: 'Read', file_path: '/a/b/README.md' })).toBe('Reading README.md')
  expect(describe({ tool: 'PowerShell', description: 'Install the fixed Trail' })).toBe('Install the fixed Trail')
  expect(describe({ tool: 'Grep' })).toBe('Searching files')
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: one compact line during a turn, with the current step, gone after it`, async ($, on) => {
    on('ui.invalidate', async () => ({ value: undefined }) as never)
    on('turn.start', async () => ({ turnId: 't1' }) as never)
    on('turn.complete', async () => ({ text: '' }) as never)
    on('tool.call', async () => ({ result: { ok: true } }) as never)
    on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)

    let ui = await $.ui.mount({ plugin: 'clawd', surface, ...BAND(false) })
    expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
    await ui.unmount()

    await $.turn.start({ turnId: 't1' } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:\\repo\\a.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
    ui = await $.ui.mount({ plugin: 'clawd', surface, ...BAND(true) })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text))
    expect(texts).toContain('Thinking…')
    expect(texts.some(t => t.endsWith('1 step'))).toBe(true)
    // A small pixel mascot on the desktop, block glyphs in the terminal.
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
    await ui.unmount()

    await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', text: 'ok' } as never)
    ui = await $.ui.mount({ plugin: 'clawd', surface, ...BAND(false) })
    expect((await ui.findAll({ type: 'Text' })).length).toBe(0)
    await ui.unmount()
  })
}
