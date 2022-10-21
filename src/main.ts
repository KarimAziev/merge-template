import * as R from 'ramda';
import arg from 'arg';
import { execa } from 'execa';
import fs from 'fs';
import inquirer from 'inquirer';
import Listr, { ListrTask } from 'listr';
import ncp from 'ncp';
import path from 'path';
import { promisify } from 'util';
import defaultModelJson from './config.json' assert { type: 'json' };

export interface PackageJson {
  dependencies?: {
    [key: string]: string;
  };
  devDependencies?: {
    [key: string]: string;
  };
}
export interface ModelJson extends PackageJson {
  deleteDependencies?: {
    [key: string]: string;
  };
  deleteDevDependencies?: {
    [key: string]: string;
  };
}

export const getPredefinedTemplate = (template: string) => {
  const fullPathName = new URL(import.meta.url).pathname;

  const templateDir = path.join(
    path.dirname(fullPathName),
    '../templates',
    template
  );
  if (fs.existsSync(templateDir)) {
    return templateDir;
  }
};

export const writeFile = promisify(fs.writeFile);
export const copy = promisify(ncp);
export const createDir = promisify(fs.mkdir);

export const overrideJsonFile = (file: string, newObj: object) => {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const updatedObj = Object.assign(obj, newObj);
  const newStr = JSON.stringify(updatedObj);
  return writeFile(file, newStr, 'utf8');
};

export async function updatePackageJson(
  targetDirectory: string,
  overrides: object
) {
  const file = path.join(targetDirectory, 'package.json');
  return overrideJsonFile(file, overrides);
}

export function copyFilter(file: string) {
  const omitNames = [
    'node_modules',
    'build',
    'dist',
    '.git',
    'package-json-overrides.json',
  ];
  const name = path.basename(file);
  const result = omitNames.includes(name);

  return result;
}

export async function copyTemplateFiles(
  sourceDir: string,
  targetDirectory: string
) {
  await copy(sourceDir, targetDirectory, {
    clobber: true,
    filter: copyFilter,
  });
}

export function locateFile(baseName: string) {
  let dir = process.cwd();
  const shouldUp = (d: string) =>
    fs.existsSync(d) && !fs.existsSync(path.resolve(d, baseName));

  while (shouldUp(dir)) {
    dir = path.dirname(dir);
  }
  if (fs.existsSync(path.resolve(dir, baseName))) {
    path.dirname(dir);
  }
  return dir;
}
export const isInstalled = (
  packageJson: {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
    peerDependencies?: { [key: string]: string };
  },
  dependency: string
) =>
  [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ].find((deps) => deps && deps[dependency]);

export function resolveCurrentGitProject() {
  let dir = process.cwd();
  const shouldUp = (d: string) =>
    fs.existsSync(d) && !fs.existsSync(path.resolve(d, '.git'));

  while (shouldUp(dir)) {
    dir = path.dirname(dir);
  }

  return dir;
}

export const makeDeleteTasks = (
  dependenciesToRemove: string[],
  packageJson: {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
  }
) => {
  const { dependencies, devDependencies } = packageJson;
  const allDeps = { ...dependencies, ...devDependencies };
  const tasks = R.intersection(dependenciesToRemove, Object.keys(allDeps)).map(
    (dependency) => ({
      title: `'Removing ${dependency}`,
      task: () => execa('yarn', ['remove', dependency]),
    })
  );
  return new Listr(tasks);
};
export const installOrUpdateTask = (
  dependency: string,
  version: string,
  hash: object,
  flags?: string[]
) => {
  const installedVersion = hash && hash[dependency];
  const args = [
    installedVersion ? 'add' : 'upgrade',
    `${dependency}@${version}`,
    ...(flags || []),
  ];
  const prefix = installedVersion ? 'Updating' : 'Installing';

  return {
    title: `${prefix} ${dependency}@${version}`,
    enabled: () => installedVersion !== version,
    task: () => execa('yarn', args),
  } as ListrTask;
};

export const makeInstallOrUpdateTasks = (
  modelPackageJson: {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
  },
  packageJson: {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
  }
) => {
  const { dependencies, devDependencies } = packageJson;
  const allDeps = { ...dependencies, ...devDependencies };
  const makeTasks = (data: object, flags?: string[]) =>
    Object.keys(data).map((dep) =>
      installOrUpdateTask(dep, data[dep], allDeps, flags)
    );
  const requiredDeps = [
    ...makeTasks(modelPackageJson.dependencies || {}),
    ...makeTasks(modelPackageJson.devDependencies || {}, ['-D']),
  ];
  return new Listr(requiredDeps, { exitOnError: false });
};

export function readJsonFileSync(file: string) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(err);
  }
}
const promptInstall = async (
  modelJson: ModelJson,
  packageJson: PackageJson,
  skipPrompts?: boolean
) => {
  const requiredDeps = Object.keys({
    ...modelJson.dependencies,
    ...modelJson.devDependencies,
  });
  if (skipPrompts) {
    return makeInstallOrUpdateTasks(modelJson, packageJson);
  } else {
    const deps: { [key: string]: string[] } = await inquirer.prompt([
      {
        type: 'checkbox',
        message: 'Dependencies to install or update',
        name: 'Install',
        choices: requiredDeps.map((name) => ({ name, checked: true })),
      },
    ]);
    const okeys = Object.values(deps)[0];
    const confirmed = R.evolve({
      dependencies: R.pick(okeys),
      devDependencies: R.pick(okeys),
    })(modelJson);

    return makeInstallOrUpdateTasks(confirmed, packageJson);
  }
};

export async function cli() {
  const options = parseArgumentsIntoOptions(process.argv);
  if (options.help) {
    console.log(
      `Usage:
Run in project root:

merge-template --template path-to-template

`
    );
    return;
  }
  const { skipPrompts, templateDir, projectRoot, noInstall, noCopy, noDelete } =
    options;
  const packageJsonFile =
    projectRoot && path.resolve(projectRoot as string, 'package.json');
  if (!projectRoot || !packageJsonFile || !templateDir) {
    throw new Error('Project root not found');
  }
  const packageJsonModelFile = path.join(
    templateDir,
    'package-json-overrides.json'
  );

  const modelJson =
    packageJsonModelFile && fs.existsSync(packageJsonModelFile)
      ? JSON.parse(fs.readFileSync(packageJsonModelFile, 'utf8'))
      : defaultModelJson;
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));

  try {
    process.chdir(projectRoot);
  } catch (err) {
    console.error(`chdir: ${err}`);
  }

  await new Listr([
    {
      title: 'Copy project files',
      enabled: () => !noCopy && !!templateDir && fs.existsSync(templateDir),
      task: () => copyTemplateFiles(templateDir as string, projectRoot),
    },
    {
      title: 'Install or update',
      enabled: () => !noInstall,
      task: () => promptInstall(modelJson, packageJson, skipPrompts),
    },
    {
      title: 'Delete dependencies',
      enabled: () => !noDelete,
      task: () =>
        makeDeleteTasks(
          Object.keys({
            ...modelJson.deleteDependencies,
            ...modelJson.deleteDevDependencies,
          }),
          packageJson
        ),
    },
  ]).run();
}

function parseArgumentsIntoOptions(rawArgs: string[]) {
  const args = arg(
    {
      '--yes': Boolean,
      '--template': String,
      '--no-install': Boolean,
      '--no-copy': Boolean,
      '--no-delete': Boolean,
      '--help': Boolean,
      '-g': '--git',
      '-y': '--yes',
      '-p': '--template',
      '-h': '--help',
    },
    {
      argv: rawArgs.slice(2),
    }
  );

  return {
    help: args['--help'] || false,
    skipPrompts: args['--yes'] || true,
    templateDir: args['--template'] || getPredefinedTemplate('cra-overrides'),
    projectRoot: args._[0] || resolveCurrentGitProject(),
    noInstall: args['--no-install'] || false,
    noDelete: args['--no-delete'] || false,
    noCopy: args['--no-copy'] || false,
  };
}

cli();
