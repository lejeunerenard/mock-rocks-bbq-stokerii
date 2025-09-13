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
stoker.listen(80, '0.0.0.0')
```

## API

#### `const stoker = new StokerII(sensors: Array<Sensor>)`

Create a new mock stoker with the provided `sensors`.

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

## CLI

There is a CLI for easy mocking of the Stoker II as a separate process.

```console
mock-rocks-bbq-stokerii
```

See the [repo](https://github.com/lejeunerenard/mock-rocks-bbq-stokerii-cli) for
instructions to install.

## Links

- [Review of the Stoker II](https://amazingribs.com/thermometers/rocks-bar-b-que-stoker-ii/)
