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
      error: 'current must be one of fixed, increment, thermal'
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
      error: 'current must be one of fixed, increment, thermal'
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

test('basic - sensor current - thermal rise decelerates', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 70,
        ambient: 45
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1358
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 70,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'first report is the set temperature')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 116.3,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'rises 46.3 while the blower runs')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 151,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'rises 34.7, slower than the previous rise')
  })
})

test('basic - sensor current - thermal crossing cuts the blower', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 249,
        ambient: 45
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1359
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 249,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'blower runs under target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 250.5,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'crossing target turns the blower off')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 209.4,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the cooled reading has the blower running again')
  })
})

test('basic - sensor current - thermal glide toward ambient', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      current: {
        type: 'thermal',
        value: 150,
        ambient: 40,
        cool: 0.5
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1360
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 150,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'nothing reheats an unassigned probe')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 95,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'glides toward ambient')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 67.5,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'still above ambient')
  })
})

test('basic - sensor current - thermal cool of zero reaches ambient floor', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      current: {
        type: 'thermal',
        value: 150,
        ambient: 40,
        cool: 0
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1361
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 150,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'first report is the set temperature')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 40,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'cool of zero collapses the whole gap in one report')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 40,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'ambient is settled, not drifted through')
  })
})

test('basic - sensor current - thermal under ambient pins at ambient', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      current: {
        type: 'thermal',
        value: 30,
        ambient: 45
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1362
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 30,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'a reading set under ambient reports what it was set to')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 45,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'it warms to ambient rather than away from it')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 45,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'and pins there')
  })
})

// TODO verify with the actual device if its possible to share the blower between 2+ sensors
test('basic - sensor current - thermal probes sharing a blower share the fan state', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Prime_Rib',
      target: 135,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 120,
        ambient: 100,
        heat: 0.9,
        cool: 0.5
      }
    },
    {
      id: '5111111111111111',
      name: 'Brisket',
      target: 135,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 150,
        ambient: 100,
        heat: 0.9,
        cool: 0.5
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1363
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Prime_Rib',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 120,
          blower: '500000002BEE5C3A'
        }, {
          id: '5111111111111111',
          name: 'Brisket',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 150,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the blower runs because some probe on it is under target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Prime_Rib',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 138,
          blower: '500000002BEE5C3A'
        }, {
          id: '5111111111111111',
          name: 'Brisket',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 141,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'the probe over target heats too, driven by the shared fan state')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Prime_Rib',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 119,
          blower: '500000002BEE5C3A'
        }, {
          id: '5111111111111111',
          name: 'Brisket',
          al: 0,
          ta: 135,
          th: null,
          tl: null,
          tc: 120.5,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'both over target together cut the blower, then both glide back')
  })
})

test('basic - sensor current - thermal without ambient', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 70
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1364
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'thermal must define a value & ambient'
    }, 'thermal without ambient reported')
  })
})

test('basic - sensor current - thermal cool out of range', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      current: {
        type: 'thermal',
        value: 150,
        ambient: 40,
        cool: 1
      }
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1365
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'thermal cool must be between 0 & 1'
    }, 'cool of 1 reported instead of freezing the probe')
  })
})

test('basic - sensor current - thermal post handler does not advance', async (t) => {
  t.plan(3)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 70,
        ambient: 45
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1366
  stoker.listen(port, async () => {
    t.is(await postForm(port, 'ta5D000012BCE31030=250.0'), submit, 'stoker submitted the target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 70,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the post handler leaves the thermal current unadvanced')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 116.3,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the first get advances it once')
  })
})

test('basic - sensor current - thermal reports one decimal', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 70.256,
        ambient: 45
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1367
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 70.3,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the set temperature is rounded to the device precision')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 116.5,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the next step advances from the rounded reading')
  })
})

test('basic - sensor current - thermal hovers and cuts the blower twice', async (t) => {
  t.plan(4)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 249,
        ambient: 45,
        heat: 0.9
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1368
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 249,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'blower runs under target')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 254.4,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'the overshoot of 5 is what lets a running probe cut the blower')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 212.5,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the glided reading is under target so the blower runs again')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 250.8,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'and the probe cuts it a second time')
  })
})

test('basic - sensor current - thermal probe assigned to an unconfigured blower', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '5FFFFFFFFFFFFFFF',
      current: {
        type: 'thermal',
        value: 150,
        ambient: 40,
        cool: 0.5
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1369
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 150,
          blower: '5FFFFFFFFFFFFFFF'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'an assignment to an id the stoker does not have runs nothing')

    t.alike(await getStokerJson(port), {
      stoker: {
        sensors: [{
          id: '5D000012BCE31030',
          name: 'Pit_Temp',
          al: 0,
          ta: 250,
          th: null,
          tl: null,
          tc: 95,
          blower: '5FFFFFFFFFFFFFFF'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'the reading glides toward ambient rather than rising')
  })
})

test('basic - sensor current - thermal heat is not a number', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Pit_Temp',
      target: 250,
      blower: '500000002BEE5C3A',
      current: {
        type: 'thermal',
        value: 150,
        ambient: 40,
        heat: NaN
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1370
  stoker.listen(port, async () => {
    t.alike(await getStokerJson(port), {
      error: 'thermal heat must be a number'
    }, 'a non-number knob reported instead of a tc that prints null')
  })
})

test('basic - post handler - thermal probe assigned and unassigned over http', async (t) => {
  t.plan(5)
  const stoker = new StokerII([
    {
      id: '5D000012BCE31030',
      name: 'Meat_Probe',
      target: 165,
      current: {
        type: 'thermal',
        value: 73,
        ambient: 45,
        cool: 0.75
      }
    }
  ], [
    {
      id: '500000002BEE5C3A',
      name: 'Firebox'
    }
  ])

  t.teardown(() => stoker.close())

  const port = 1371
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
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'the reading only glides while nothing is set to the blower')

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
          tc: 97.3,
          blower: '500000002BEE5C3A'
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 1
        }]
      }
    }, 'the reading rises under the fan the previous report implied')

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
          tc: 84.2,
          blower: null
        }],
        blowers: [{
          id: '500000002BEE5C3A',
          name: 'Firebox',
          on: 0
        }]
      }
    }, 'unassigned over the wire it starts gliding to ambient')
  })
})
