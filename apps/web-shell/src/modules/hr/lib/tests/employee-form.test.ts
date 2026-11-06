/**
 * v0.2.3 Блок R8 — «Код автоматаар олгох»
 */
import { describe, expect, it } from 'vitest'
import { autoCodeExample, codePayload, codeReady, suggestAutoCode } from '../employee-form'

describe('employee-form (R8)', () => {
  it('гэрээт / туслан гүйцэтгэгч → автомат кодыг санал болгоно; үндсэн, сонгоогүй → үгүй', () => {
    expect([suggestAutoCode('CONTRACTOR'), suggestAutoCode('SUBCONTRACTOR'), suggestAutoCode('MAIN'), suggestAutoCode(undefined)]).toEqual([true, true, false, false])
  })

  it('жишээ код — кемпийн угтвар (анхдагч Z)', () => {
    expect([autoCodeExample('GR'), autoCodeExample(undefined), autoCodeExample('')]).toEqual(['GR0001', 'Z0001', 'Z0001'])
  })

  it('автомат үед код шаардахгүй, илгээхгүй; эс бөгөөс trim хийсэн код', () => {
    expect([codeReady(true, ''), codeReady(false, '  '), codeReady(false, '10001')]).toEqual([true, false, true])
    expect(codePayload(true, 'X')).toEqual({})
    expect(codePayload(false, ' 10001 ')).toEqual({ employeeCode: '10001' })
  })
})
