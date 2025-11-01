import http from 'http'

const sensorCurrent = (current) => {
  switch (current.type) {
    case 'fixed':
      return current.value
    case 'increment':
      if (current.amount === undefined || current.value === undefined) throw Error('increment must defined both a value & amount')
      current.previous = current.previous || (current.value - current.amount)
      const nextValue = current.previous + current.amount
      current.previous = nextValue
      return nextValue
  }
}

const processSensor = (sensor) => ({
  name: sensor.name,
  ta: sensor.target,
  tc: sensorCurrent(sensor.current)
})

export default class StokerII {
  constructor (sensors = []) {
    this.sensors = sensors

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(`http://localhost${req.url}`);
        console.log('request for', url.pathname)
        switch (url.pathname) {
          case '/stoker.json':
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')

            res.write(JSON.stringify({
              stoker: {
                sensors: this.sensors.map((sensor) => processSensor(sensor))
              }
            }))
            return res.end()
            break
          default:
            res.statusCode = 500
            res.end('woops')
        }
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          error: err.message
        }))
      }
    })

    server.on('listening', () => {
      const { host, port } = server.address()
      console.log(`server is bound on ${host}:${port}`)
    })

    this.server = server
  }

  addSensor (name, opts) {
    this.sensors.push({
      name,
      ...opts
    })
  }

  listen (...args) {
    return this.server.listen(...args)
  }

  close () {
    return this.server.close()
  }
}
