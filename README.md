# Mock Rock's BBQ Stoker II

This library emulates a Rock's BBQ Stoker II unit for testing purposes.

## Usage

```javascript
import Stoker from 'mock-rocks-bbq-stokerii'

const stoker = new StokerII()
stoker.addSensor('BGE_Temp', {
  target: 250,
  current: {
    type: 'fixed',
    value: 207
  }
})
stoker.addBlower('Firebox')
stoker.listen(80, '0.0.0.0')
```

## API

#### `const stoker = new StokerII(sensors: Array<Sensor>, blowers: Array<Blower>)`

Create a new mock stoker with the provided `sensors` and `blowers`.

`Sensor`s have the following structure:

```
{
  name: 'Sensor name', // The name set in the stoker's web UI
  target: 350, // The target degrees in Fahrenheit for the sensor
  current: {
    type: 'fixed' // The method for emulating the sensor's current temperature
  }
}
```

`Blower`s have the following structure:

```
{
  name: 'Blower name' // Defaults to the blower's id
}
```

Both `Sensor`s and `Blower`s are given an `id` by the mock when one is not provided, the
same way the stoker assigns ids to its own probes and blowers.

A `Sensor` can name the `blower` it is set to, which is how the stoker decides whether that
blower is running:

```
{
  name: 'Meat_Probe',
  target: 165,
  blower: '500000002BEE5C3A',
  current: {
    type: 'fixed',
    value: 73
  }
}
```

The `blower` is reported `on` while its probe reads under `target`, and `off` once the probe
reaches it, so a blower's `on` is always derived from the probes and never configured.

Possible `type` values for `current`:

- `fixed`  
  Returns the provided `value` every request. For example the following always
  returns `150`:

  ```
  {
    name: 'Foo',
    target: 350,
    current: {
      type: 'fixed',
      value: 150
    }
  }
  ```
- `increment`  
  Returns a value starting at `value` and incrementing by `amount` every time.
  For example the following returns `150`, `157`, `164` etc:
  ```
  {
    name: 'Foo',
    target: 350,
    current: {
      type: 'increment',
      value: 150,
      amount: 7
    }
  }
  ```
  A current advances once per request that reports it, and the `POST /stoker.Post_Handler`
  that configures a probe does not report one, so the first `GET` reports the `value` set.
- `thermal`  
  Emulates a probe the blower drives: while a blower set to the probe runs, the reading moves
  `heat` of the way to `ta + overshoot`, and while it is off the reading keeps `cool` of its
  gap above `ambient`, so the rise decelerates as it nears `ta + overshoot` and the fall glides
  down toward `ambient` until the reading is back under `ta` and the blower runs again. For
  example the following returns `70.3`, `116.5`, `151.1` etc, each rise slower than the last:
  ```
  {
    name: 'Pit_Temp',
    target: 250,
    blower: '500000002BEE5C3A',
    current: {
      type: 'thermal',
      value: 70.256,
      ambient: 45
    }
  }
  ```
  A `thermal` reading is reported to one decimal, the device's own precision, so the next step
  advances from the rounded value. `value` and `ambient` are required, `heat` defaults to `0.25`,
  `cool` to `0.8` and `overshoot` to `5`, and the `blower` has to name a blower the stoker has,
  added with `addBlower` or `n2<id>`: a probe set to an id it does not have drives nothing and
  the reading only glides.

  `cool` is from `0` up to but not including `1`, `0` collapsing the whole gap and landing the
  reading on `ambient` in one request, while `1` or more is an error rather than a probe that
  freezes or heats with the blower off. `ambient` is the floor the probe glides to, and a
  reading set below `ambient` is pulled up to it and stays there. A probe set to a blower hovers
  between the cut above `ta` and the dip that follows it rather than settling at
  `ta + overshoot`, and only slides down to `ambient` once no blower is set to it. A missing or
  non-number `value`, `ambient`, `heat`, `cool` or `overshoot`, or a `cool` outside its range,
  is reported as an error for the request, e.g. `thermal cool must be a number`, rather than as
  a `null` reading.

#### `stoker.addSensor(name, opts)`

Adds a probe named `name` with the `opts` merged into it, and returns it so its `id` can be
used to set `blower` on the probe.

#### `stoker.addBlower(name, opts)`

Adds a blower named `name` with the `opts` merged into it, and returns it so its `id` can be
used to set `blower` on a probe.

## HTTP

`GET /stoker.json` reports the probes and blowers the stoker is configured with. With no
probes the stoker reports `sensors` as `null`:

```json
{ "stoker": { "sensors": null, "blowers": [ { "id": "500000002BEE5C3A", "name": "500000002BEE5C3A", "on": 0 } ] } }
```

The stoker's own web UI configures it over `POST /stoker.Post_Handler` with a form body, so
a probe or blower can be added and a blower assigned to a probe without touching the API.
Form keys are a field followed by the id the stoker gave the entity:

| Key | Meaning |
| --- | ------- |
| `n1<id>` | Probe name |
| `n2<id>` | Blower name |
| `ta<id>` | Probe target degrees |
| `al<id>` | Probe alarm |
| `th<id>` | Probe temp high |
| `tl<id>` | Probe temp low |
| `sw<id>` | Blower set to the probe, its id or `None` |

`n/a` means not set. Unknown ids create the probe or blower, and a probe created this way
reports a current temperature of `0` because the form carries no way to say what it reads,
set `current` through the API to emulate real readings. A `sw` value that is not an id leaves
the probe unassigned. The response is the stoker's `Stoker Submit` page, like the device's.

```bash
curl -d 'n2500000002BEE5C3A=500000002BEE5C3A' http://localhost:80/stoker.Post_Handler
curl -d 'sw5D000012BCE31030=500000002BEE5C3A' http://localhost:80/stoker.Post_Handler
curl http://localhost:80/stoker.json
```

The blower reports `on` while that probe reads under its `ta`:

```console
$ curl http://localhost:80/stoker.json
{ "stoker": { "sensors": [ { "id": "5D000012BCE31030", "name": "Meat_Probe", "al": 0, "ta": 165.0, "th": 155.0, "tl": 32.0, "tc": 73.0, "blower": "500000002BEE5C3A" } ], "blowers": [ { "id": "500000002BEE5C3A", "name": "500000002BEE5C3A", "on": 1 } ] } }
```

A `thermal` reading moves under the fan the previous report implied, while `on` in a row is
derived from the `tc` in that row, so `on` is `1` whenever some probe set to the blower reports
`tc` under `ta`: a row that has just come back under target is already blowing again. The
assignment itself is not lagged, the next request uses whatever `sw` last set.

## CLI

There is a CLI for easy mocking of the Stoker II as a separate process.

```console
mock-rocks-bbq-stokerii
```

See the [repo](https://github.com/lejeunerenard/mock-rocks-bbq-stokerii-cli) for
instructions to install.

## Links

- [Review of the Stoker II](https://amazingribs.com/thermometers/rocks-bar-b-que-stoker-ii/)
