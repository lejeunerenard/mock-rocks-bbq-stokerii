import test from 'brittle'
import StokerII from '../index.js'
import http from 'http'

const createClient = (port) => {
  http.request({ port }, (res) => {

  })
}

test('basic - set sensors', (t) => {
  const initialSensor = {
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

test('basic - can request stoker json', async (t) => {
  t.plan(1)
  const stoker = new StokerII([
    {
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
  stoker.listen(port, () => {
    const client = http.request({ port, path: '/stoker.json' }, (res) => {
      let json = ''

      res.on('end', () => {
        const data = JSON.parse(json)
        t.alike(data, {
          stoker: {
            sensors: [{
              name: 'sensor',
              ta: 250,
              tc: 230
            }]
          }
        }, 'received json for sensor')
      }).on('data', (chunk) => {
        json += chunk
      })
    })

    client.end()
  })
})

test('basic - sensor current - increment', async (t) => {
  t.plan(2)
  const stoker = new StokerII([
    {
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
    const request = () => {
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

    const res1 = await request()
    t.alike(res1, {
      stoker: {
        sensors: [{
          name: 'sensor',
          ta: 250,
          tc: 230
        }]
      }
    }, 'received json for sensor')

    const res2 = await request()
    t.alike(res2, {
      stoker: {
        sensors: [{
          name: 'sensor',
          ta: 250,
          tc: 235
        }]
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
    const request = () => {
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

    const res = await request()
    t.alike(res, {
      error: 'increment must defined both a value & amount'
    })
  })
})
