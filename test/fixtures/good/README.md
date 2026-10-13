# good-pkg

[![npm](https://img.shields.io/npm/v/good-pkg)](https://www.npmjs.com/package/good-pkg)

A small, well documented package that formats widgets for terminals and logs. It has a CLI and a library API, both with zero dependencies, and it works on every supported Node.js version. Read on for installation, usage, options and the license.

See the [guide](docs/guide.md), the [options](#options) and [Café notes](#café-notes).

## Install

```bash
npm install good-pkg
npx good --help
```

## Usage

```js
import { format } from 'good-pkg';
console.log(format('widget'));
```

## Options

| Option | Meaning |
|---|---|
| `--width` | Output width |

## Café notes

Some prose so this section is not empty.

## License

MIT © Example
