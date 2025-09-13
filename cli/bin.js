/** @typedef {import('pear-interface')} */ /* global Pear */
import StokerII from './index.js'

const stoker = new StokerII()
stoker.addSensor('BGE_Temp', {
  target: 250,
  current: {
    type: 'fixed',
    value: 207
  }
})
stoker.listen(80, '0.0.0.0')
