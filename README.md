# merge-template

Merge your project with predefined templates or customs.

## Installation

```example
npm install merge-template -g
```

## Usage

### With default template

Run in project root:

```example
merge-template
```

It will:

1. install or update `dependencies` and `devDependencies` listed in template directory (see default [template](<[./templates/cra-overrides](./templates/cra-overrides)>)) with `package-json-overrides.json`.

You can skip this step with option `--no-install`:

```example
merge-template --no-install
```

2. copy all files from [./templates/cra-overrides](./templates/cra-overrides) except `package-json-overrides.json` to your project

> **NOTE**: files and directories from template directory will
> **override** existing files.

You can skip this step with option `--no-copy`:

```example
merge-template --no-copy
```

3. modify **package.json** in your project by rules specified in `package-json-overrides.json`.

4. migrate @material-ui/core to @mui.

You can skip this step with option `--no-mui-codemod`:

```example
merge-template --no-mui-codemod
```

## Customization

You can specify other template directory, only one file is required -
`package-json-overrides.json`.

```example
merge-template --template /home/user/my-custom-template-directory/
```

Here `/home/user/my-custom-template-directory/` must include a file
`package-json-overrides.json`. Any other directories and files will be
copy into your project root `overriding` existing ones.

### package-json-overrides.json

This file should be json and can contain following sections:

1.  **dependencies**

    Same as in package.json, will be installed or updated to specified
    version.

2.  **devDependencies**

    Same as in package.json, will be installed or updated to specified
    version.

3.  **deleteDependencies**

    Dependencies to remove. Format is the as in package.json
    dependencies, versions will be ignored.

4.  **mergeSections**

    The value of this section will be merged into existing
    `package.json`.

    `package-json-overrides.json`

    ```example
    "mergeSections": {
        "scripts": {
          "prepare": "husky install",
          "pre-commit": "lint-staged"
        }
     }
    ```

    and in your `package.json`:

    ```example
    "scripts": {
       "start": "node index.js"
      }
    ```

    The result will be:

    ```example
    "scripts": {
       "start": "node index.js",
       "prepare": "husky install",
       "pre-commit": "lint-staged"
      }
    ```

5.  **addSections**

    The value will be added to existing `package.json`, overriding
    existing sections with the same keys.

    ```example
    "addSections": {
      "lint-staged": {
        "src/**/*.{js,jsx,json}": ["prettier --write", "eslint", "git add"]
      },
     },
    ```

6.  **removeSections**

    The value should be the array of sections from `package.json` to
    remove.

    ```example
    "removeSections": ["eslintConfig"],
    ```

### Example of package-json-overrides.json:

```example
  {
  "dependencies": {
    "react": "^17.0.2",
    "react-dom": "^17.0.2",
    "react-router": "^5.2.0",
    "react-router-dom": "^5.2.0",
  },
  "devDependencies": {
    "@types/react": "^17.0.50",
    "@types/react-dom": "^17.0.2",
    "@types/react-router": "^5.1.19",
    "@types/react-router-dom": "^5.3.3"
  },
  "deleteDependencies": {
    "enzyme-adapter-react-16": "^1.14.0",
    "less-loader": "^5.0.0",
    "node-sass": "^4.12.0",
    "tslint-config-airbnb": "^5.11.2"
  },
  "mergeSections": {
    "scripts": {
      "prepare": "husky install",
      "pre-commit": "lint-staged"
    }
  },
  "addSections": {
    "lint-staged": {
      "src/**/*.{js,jsx,json}": ["prettier --write", "eslint", "git add"]
    }
  },
  "removeSections": ["eslintConfig"]
}
```
