import test from 'brittle'
import StokerII from '../index.js'
import { submit } from '../index.js'
import http from 'http'

const probe = (id, name, opts) => {
  return { id, name, ...opts }
}

const blower = (id, name) => {
  return { id, name }
}

const getStokerJson = (port) => {
  return new Promise((resolve) => {
    const client = http.request({ port, path: '/stoker.json' }, (res) => {
      let json = ''

      res.on('end', () => {
        resolve(JSON.parse(json))
      }).on('data', (chunk) => {
        json += chunk
      })
    })

    client.end()
  })
}

const postForm = (port, form) => {
  const body = new URLSearchParams(form).toString()
  return new Promise((resolve) => {
    const client = http.request({
      port,
      path: '/stoker.Post_Handler',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(body.length)
      }
    }, (res) => {
      let html = ''

      res.on('end', () => {
        resolve(html)
      }).on('data', (chunk) => {
        html += chunk
      })
    })

    client.end(body)
  })
}

test('basic - set sensors', (t) => {
  const initialSensor = {
    id: '5D000012BCE31030',
    name: 'sensor1',
    target: 125,
    current: {
      type: 'fixed',
      value: 100
    }
  }
  const stoker = new StokerII([initialSensor])

  t.alike(stoker.sensors, [initialSensor], 'via constructor')

  const sensor2Spec = {
    id: '5111111111111111',
    target: 200,
    current: {
      type: 'fixed',
      value: 210
    }
  }
  stoker.addSensor('sensor2', sensor2Spec)

  t.alike(stoker.sensors[1], {
    ...sensor2Spec,
    name: 'sensor2'
  }, 'via stoker.addSensor()')
})

test('basic - generated ids', (t) => {
  const stoker = new StokerII()
  const sensor = stoker.addSensor('sensor1', {
    target: 125,
    current: {
      type: 'fixed',
      value: 100
    }
  })
  const blower = stoker.addBlower('blower1')

  t.ok(/^5[0-9A-F]{15}$/.test(sensor.id), 'sensor id shape')
  t.ok(/^5[0-9A-F]{15}$/.test(blower.id), 'blower id shape')
  t.is(sensor.id === blower.id, false, 'ids are unique')
})

test('basic - can request stoker json', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'sensor',
      target: 250,
      current: {
        type: 'fixed',
        value: 230
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1337
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'sensor',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 230,
          blower: null
        }],
        blowers: []
      }
    }, 'received json for sensor')
  })
})

test('basic - sensor current - increment', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5222222222222222',
      name: 'sensor',
      target: 250,
      current: {
        type: 'increment',
        value: 230,
        amount: 5
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1338
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5222222222222222',
          name: 'sensor',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 230,
          blower: null
        }],
        blowers: []
      }
    }, 'received json for sensor')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5222222222222222',
          name: 'sensor',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 235,
          blower: null
        }],
        blowers: []
      }
    }, 'received json for sensor')
  })
})

// TODO This may not be how the stokerii reports errors, but configuring sensors is outside of it's functionality.
test('basic - sensor current - increment', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      name: 'sensor',
      target: 250,
      current: {
        type: 'increment',
        value: 200
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1339
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'increment must defined both a value & amount'
    })
  })
})

test('basic - stoker json - blower attached not assigned', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      alarm: 0,
      high: 155,
      low: 32,
      current: {
        type: 'fixed',
        value: 72.4
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1340
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: 155,
          tl: 32,
          tc: 72.4,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'blower attached but not assigned')
  })
})

test('basic - stoker json - blower assigned under target', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      alarm: 0,
      high: 155,
      low: 32,
      blower: '500000002BEE5C3A',
      current: {
        type: 'fixed',
        value: 73
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1341
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: 155,
          tl: 32,
          tc: 73,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'blower assigned to probe under target')
  })
})

test('basic - blower on - probe reaches target', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'fixed',
        value: 170
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1342
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 170,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'blower off once probe reaches target')
  })
})

test('basic - blower on - increment crosses target', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'increment',
        value: 160,
        amount: 10
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1343
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 160,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'blower on while probe under target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 170,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'blower off after probe crosses target')
  })
})

test('basic - stoker json - blowers without probes', async (t) => {
  t.plan(1)
  const stoker = new StokerII([], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1344
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: null,
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'no probes reports null sensors')
  })
})

test('basic - post handler - add blower', async (t) => {
  t.plan(2)
  const stoker = new StokerII()

  t.teardown(() => stoker.close())

  const port = 1345
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'n2500000002BEE5C3A=500000002BEE5C3A'), submit, 'stoker submitted the form')
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: null,
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'blower added over http')
  })
})

test('basic - post handler - assign then unassign blower', async (t) => {
  t.plan(5)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      current: {
        type: 'fixed',
        value: 73
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1346
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 73,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'assigned over http')

    t.is(await postForm(port, 'sw5D000012BCE31030=500000002BEE5C3A'), submit, 'stoker submitted the assignment')
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 73,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'assigned over http')

    t.is(await postForm(port, 'sw5D000012BCE31030=None'), submit, 'stoker submitted the unassignment')
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 73,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'unassigned over http')
  })
})

test('basic - post handler - probe created remotely', async (t) => {
  t.plan(2)
  const stoker = new StokerII()

  t.teardown(() => stoker.close())

  const port = 1347
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'n15D000012BCE31030=Meat_Probe&ta5D000012BCE31030=165.0&al5D000012BCE31030=0&tl5D000012BCE31030=n%2Fa&th5D000012BCE31030=n%2Fa&sw5D000012BCE31030=None'), submit, 'stoker submitted the probe')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 0,
          blower: null
        }],
        blowers: []
      }
    }, 'probe created over http')
  })
})

test('basic - post handler - probes renamed remotely', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      current: {
        type: 'fixed',
        value: 73
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1348
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'n15D000012BCE31030=Brisket&xx=y&ta5D000012BCE31030=185.0'), submit, 'stoker submitted the rename')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Brisket',
          al: 0,
          ta: 185,
          th: null,
          tl: null,
          tc: 73,
          blower: null
        }],
        blowers: []
      }
    }, 'unrecognized key ignored, target updated')
  })
})

test('basic - generated ids in stoker json', async (t) => {
  t.plan(3)
  const stoker = new StokerII()
  const blower = stoker.addBlower('Firebox', {
    id: '500000002BEE5C3A'
  })
  const probe = stoker.addSensor('Meat_Probe', {
    target: 165,
    blower: blower.id,
    current: {
      type: 'fixed',
      value: 73
    }
  })

  t.ok(/^5[0-9A-F]{15}$/.test(probe.id), 'generated probe id shape')
  t.is(blower.id, '500000002BEE5C3A', 'provided blower id kept')

  t.teardown(() => stoker.close())

  const port = 1349
  stoker.listen(port, async () => {
    const config = await getStokerJson(port)
    t.alike(config.stoker.sensors[0], {
      id: probe.id,
      name: 'Meat_Probe',
      al: 0,
      ta: 165,
      th: null,
      tl: null,
      tc: 73,
      blower: '500000002BEE5C3A'
    }, 'generated probe id reported')
  })
})

test('basic - blower name defaults to id', async (t) => {
  t.plan(1)
  const stoker = new StokerII([], [
    {
      id: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1350
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: null,
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'blower without a name reports its id')
  })
})

test('basic - post handler - adding a blower named over http', async (t) => {
  t.plan(2)
  const stoker = new StokerII()

  t.teardown(() => stoker.close())

  const port = 1351
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'n2500000002BEE5C3A=Fire%20box'), submit, 'stoker submitted the name')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: null,
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Fire box',
          on: 0
        }]
      }
    }, 'blower named over http')
  })
})

test('basic - post handler - assigning an unknown blower', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      current: {
        type: 'fixed',
        value: 73
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1352
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'sw5D000012BCE31030=500000002BEE5C3A'), submit, 'stoker submitted the assignment')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 73,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'assigning an unknown blower adds it')
  })
})

test('basic - blower on - two probes set to one blower', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'fixed',
        value: 180
      }
    },
    {
      id: '5111111111111111',
      name: 'Brisket',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'fixed',
        value: 90
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1353
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 180,
          blower: '500000002BEE5C3A'
        }, {
          id: '5111111111111111',
          name: 'Brisket',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 90,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'blower runs while any probe set to it is under target')
  })
})

test('basic - sensor current - every request advances increment', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'increment',
        value: 140,
        amount: 25
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1354
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'ta5D000012BCE31030=165.0'), submit, 'stoker submitted the target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 140,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 1
        }]
      }
    }, 'get advances current once')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Meat_Probe',
          al: 0,
          ta: 165,
          th: null,
          tl: null,
          tc: 165,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'get advances current again')
  })
})

test('basic - sensor current - not fixed or increment', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      blower: '500000002BEE5C3A',
      current: {
        type: 'celsius'
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1355
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'current must be fixed or increment'
    }, 'unknown current type reported')
  })
})

test('basic - sensor current - no current', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1356
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'current must be fixed or increment'
    }, 'missing current reported')
  })
})

test('basic - post handler - empty form keeps configuration', async (t) => {
  t.plan(2)
  const stoker = new StokerII([], [
    {
      id: '500000002BEE5C3A',
      name: '500000002BEE5C3A'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1357
  stoker.listen(port, async () => {
    t.is(await postForm(port, ''), submit, 'stoker submitted the empty form')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: null,
        blowers: [{
          id: '500000002BEE5C3A',
          name: '500000002BEE5C3A',
          on: 0
        }]
      }
    }, 'empty form is a no-op')
  })
})
