# merge-template

Merge your project with predefined templates or customs, install
dependencies and apply some codemods.

## Installation

```example
npm install merge-template -g
```

## Usage

To use default default template and files run in your project root:

```example
merge-template
```

### With default template

It will:

- install or update `dependencies` and `devDependencies` listed in
  [package-json-overrides.json](./templates/cra-overrides) (by
  default).

You can skip this step with option `--no-install`:

```example
merge-template --no-install
```

- copy all files from
  [./templates/cra-overrides](./templates/cra-overrides) (or custom
  template directory) to your project.

> **NOTE**: files and directories from the template directory will
> **override** existing files.

You can skip this step with the option `--no-copy-files` or use your own
template (see section [Customization](#Customization)).

```example
merge-template --no-copy-files
```

- modify `package.json` in your project by rules specified in
  `package-json-overrides.json`.

## Customization

### Command line options

```example

--template                    use template directory with package-json-overrides.json (required) and files to copy
--no-install                  skip installation step
--no-copy-files               don't copy files from template directory
--no-delete                   don't delete dependencies listed in "deleteDependencies" in package-json-overrides.json
--no-post-tasks               don't execute post tasks (section "postTasks" in package-json-overrides.json)
--ignore-files                files in template directory that should't be copied into project. Default: 'node_modules' 'build' 'dist' '.git' 'package-json-overrides.json'
```

You can specify your own template directory with option `--template`. It
must include a file `package-json-overrides.json`.

```example
merge-template --template /home/user/my-custom-template-directory/
```

Any other directories and files in this directory will be copied into
your project root, `overriding` existing ones.

### package-json-overrides.json

This file should be JSON and can contain the following sections:

1.  `dependencies`

    The format is the as in `package.json` dependencies, it will be
    installed or updated to specified version.

2.  `devDependencies`

    The format is the as in `package.json` devDependencies, it will be
    installed or updated to specified version.

3.  `deleteDependencies`

    Dependencies to remove. The format is the as in `package.json`
    dependencies, but versions will be ignored.

4.  `mergeSections`

    The value of this section will be merged into existing
    `package.json`.

5.  `addSections`

    The value will be added to the existing `package.json`, overriding
    existing sections.

6.  `postTasks`

    Shell commands to execute after other steps. Nested lists where each element is an array of form [command, …args], e.g.:

```example
"postTasks": [["npx", "@mui/codemod", "v5.0.0/preset-safe", "src"]]
```
