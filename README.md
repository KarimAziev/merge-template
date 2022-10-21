# merge-template

Merge your project with templates.

## Installation

```example
npm install merge-template -g
```

## Usage

### With custom template

Run in project root:

```example
merge-template --template path-to-your-template-directory
```

`path-to-your-template-directory` should be an absolute path to
directory with file `package-json-overrides.json` and any other fils and
directories to copy into your project root `overriding` existing ones.

Such sections is supported in `package-json-overrides.json: =dependencies`, `devDependencies`, `deleteDevDependencies` and
`deleteDependencies`.

<!-- end list -->

For example:

```example
{
  "dependencies": {
    "babel-jest": "27.5.1",
    "babel-plugin-import": "1.13.5",
    "customize-cra": "^1.0.0",
    "prettier": "^2.6.2",
    "react": "^17.0.2",
    "react-dom": "^17.0.2",
    "react-router": "^5.2.0",
    "react-router-dom": "^5.2.0",
    "react-scripts": "^5.0.1",
    "typescript": "^4.7.3"
  },
  "devDependencies": {
    "@types/ramda": "^0.28.15",
    "@types/react": "^17.0.50",
    "@types/react-dom": "^17.0.2",
    "@types/react-router": "^5.1.19",
    "@types/react-router-dom": "^5.3.3",
    "@typescript-eslint/eslint-plugin": "^5.28.0",
    "@typescript-eslint/parser": "^5.28.0",
    "assert": "^2.0.0",
    "buffer": "^6.0.3",
    "crypto-browserify": "^3.12.0",
    "eslint": "^7.18.0",
    "eslint-config-airbnb": "^18.2.1",
    "eslint-config-prettier": "^7.2.0",
    "eslint-import-resolver-typescript": "^2.5.0",
    "eslint-plugin-import": "^2.22.1",
    "eslint-plugin-prettier": "^3.3.1",
    "eslint-plugin-react": "^7.27.1",
    "https-browserify": "^1.0.0",
    "husky": "^8.0.1",
    "jest-watch-typeahead": "^2.0.0",
    "lint-staged": "^10.5.4",
    "os-browserify": "^0.3.0",
    "path-browserify": "^1.0.1",
    "process": "^0.11.10",
    "react-app-rewired": "^2.2.1",
    "stream-browserify": "^3.0.0",
    "stream-http": "^3.2.0",
    "url": "^0.11.0"
  },
  "deleteDependencies": {
    "enzyme-adapter-react-16": "^1.14.0",
    "less-loader": "^5.0.0",
    "node-sass": "^4.12.0",
    "tslint-config-airbnb": "^5.11.2"
  },
  "deleteDevDeps": {
    "eslint-plugin-react-hooks": "^1.7.0"
  }
}
```

1.  Run in project root directory:

<!-- end list -->

```example
merge-template --template path-to-your-template-directory
```

### With default template:

Run in project root:

```example
merge-template
```

It will copy files from [./templates/cra-overrides](./templates/cra-overrides), and install sepcified version in
