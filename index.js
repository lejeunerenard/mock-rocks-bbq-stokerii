import http from 'http'
import crypto from 'crypto'
import { URL, URLSearchParams } from 'url'

const entityPattern = /^n([12])([0-9A-F]{16})$/
const probePattern = /^(ta|al|th|tl|sw)([0-9A-F]{16})$/
const entityIdPattern = /^[0-9A-F]{16}$/

const probeFields = {
  ta: 'target',
  al: 'alarm',
  th: 'high',
  tl: 'low',
  sw: 'blower'
}

const nextId = () => `5${crypto.randomBytes(8).toString('hex').slice(1).toUpperCase()}`

const currentTypes = ['fixed', 'increment', 'thermal']

const round = (value) => Math.round(value * 10) / 10

const knobValidation = (value, name, fallback) => {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) throw Error(`thermal ${name} must be a number`)
  return value
}

const sensorCurrent = (sensor, reading, blowerRunning) => {
  const current = sensor.current
  switch (current.type) {
    case 'fixed': {
      return current.value
    }
    case 'increment': {
      if (current.amount === undefined || current.value === undefined) throw Error('increment must defined both a value & amount')
      if (reading === undefined) return current.value
      return reading + current.amount
    }
    case 'thermal': {
      if (current.value === undefined || current.ambient === undefined) throw Error('thermal must define a value & ambient')
      if (!Number.isFinite(current.value) || !Number.isFinite(current.ambient)) throw Error('thermal value & ambient must be numbers')

      const ambient = current.ambient
      const heat = knobValidation(current.heat, 'heat', 0.25)
      const cool = knobValidation(current.cool, 'cool', 0.8)
      const overshoot = knobValidation(current.overshoot, 'overshoot', 5)

      if (!(cool >= 0 && cool < 1)) throw Error('thermal cool must be between 0 & 1')

      if (reading === undefined) return round(current.value)

      const peak = sensor.target + overshoot
      const value = blowerRunning ? reading + (peak - reading) * heat : ambient + (reading - ambient) * cool
      return round(Math.max(ambient, value))
    }
    default: {
      throw Error(`current must be one of ${currentTypes.join(', ')}`)
    }
  }
}

const processSensor = (sensor, tc) => ({
  id: sensor.id,
  name: sensor.name,
  al: sensor.alarm ?? 0,
  ta: sensor.target,
  th: sensor.high ?? null,
  tl: sensor.low ?? null,
  tc,
  blower: sensor.blower ?? null
})

const processBlower = (blower, running) => ({
  id: blower.id,
  name: blower.name ?? blower.id,
  on: Number(running)
})

const readForm = (request) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
  })
  return new Promise((resolve) => request.on('end', () => {
    resolve(new URLSearchParams(body))
  }))
}

const formValue = (value) => value === 'n/a' ? null : Number(value)

export const submit = `
<HTML>
    <title>Stoker Submit</title>
    <BODY>
        <CENTER>
            <H1>Completed setting new configuration.</H1>
            Click <A HREF="index.html">here</a>
            if not automatically redirected
        </CENTER>
    </BODY>
</HTML>
`

const reported = (sensor, readings) => readings.get(sensor.id)

const sendSubmit = (response) => {
  response.statusCode = 200
  response.setHeader('Content-Type', 'text/html')
  response.end(submit)
}

const send = (response, status, payload) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

export default class StokerII {
  constructor (sensors = [], blowers = []) {
    this.sensors = sensors.map((sensor) => ({ id: nextId(), ...sensor, current: { ...sensor.current } }))
    this.blowers = blowers.map((blower) => ({ id: nextId(), ...blower }))
    this.readings = new Map()

    const server = http.createServer(async (request, response) => {
      try {
        const { pathname } = new URL(`http://localhost${request.url}`)
        console.log('request for', pathname)

        switch (pathname) {
          case '/stoker.json':
            send(response, 200, this.config())
            break
          case '/stoker.Post_Handler':
            this.applyForm(await readForm(request))
            sendSubmit(response)
            break
          default:
            response.statusCode = 500
            response.end('woops')
        }
      } catch (err) {
        send(response, 500, {
          error: err.message
        })
      }
    })

    server.on('listening', () => {
      const { host, port } = server.address()
      console.log(`server is bound on ${host}:${port}`)
    })

    this.server = server
  }

  config () {
    const previous = this.readings
    const driven = this.runningBlowers(previous)
    const readings = new Map()
    const rows = this.sensors.map((sensor) => {
      const tc = sensorCurrent(sensor, reported(sensor, previous), driven.has(sensor.blower))
      readings.set(sensor.id, tc)
      return processSensor(sensor, tc)
    })
    this.readings = readings
    const running = this.runningBlowers(readings)
    return {
      stoker: {
        sensors: rows.length ? rows : null,
        blowers: this.blowers.map((blower) => processBlower(blower, running.has(blower.id)))
      }
    }
  }

  runningBlowers (readings) {
    return new Set(this.blowers.filter((blower) => this.sensors.some((sensor) => sensor.blower === blower.id && this.showing(sensor, readings) < sensor.target)).map((blower) => blower.id))
  }

  showing (sensor, readings) {
    return reported(sensor, readings) ?? sensor.current.value
  }

  addSensor (name, opts = {}) {
    const sensor = { id: nextId(), ...opts, name, current: { ...opts.current } }
    this.sensors.push(sensor)
    return sensor
  }

  addBlower (name, opts = {}) {
    const blower = { id: nextId(), ...opts, name }
    this.blowers.push(blower)
    return blower
  }

  applyForm (form) {
    for (const [key, value] of form) {
      const entity = entityPattern.exec(key)
      if (entity !== null) {
        const spec = entity[1] === '1' ? this.ensureProbe(entity[2]) : this.ensureBlower(entity[2])
        spec.name = value
        continue
      }

      const field = probePattern.exec(key)
      if (field === null) continue

      const probe = this.ensureProbe(field[2])
      probe[probeFields[field[1]]] = field[1] === 'sw' ? this.assignedBlower(value) : formValue(value)
    }
  }

  assignedBlower (name) {
    if (entityIdPattern.test(name)) return this.ensureBlower(name).id
    return null
  }

  ensureProbe (id) {
    let probe = this.sensors.find((sensor) => sensor.id === id)
    if (probe === undefined) {
      probe = { id, name: id, current: { type: 'fixed', value: 0 } }
      this.sensors.push(probe)
    }
    return probe
  }

  ensureBlower (id) {
    let blower = this.blowers.find((blower) => blower.id === id)
    if (blower === undefined) {
      blower = { id, name: id }
      this.blowers.push(blower)
    }
    return blower
  }

  listen (...args) {
    return this.server.listen(...args)
  }

  close () {
    return this.server.close()
  }
}
