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

const ignoreInTemplateDirNames = [
  'node_modules',
  'build',
  'dist',
  '.git',
  'package-json-overrides.json',
];

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
  addSections?: object;
  removeSections?: string[];
  mergeSections?: {
    [key: string]: any;
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

export async function mergeJsonFile(file: string, overrides: object) {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const updatedObj = Object.assign(obj, overrides);
  const newStr = JSON.stringify(updatedObj);
  return writeFile(file, newStr, 'utf8');
}

export async function writeJsonFile(file: string, updatedObj: object) {
  return writeFile(file, JSON.stringify(updatedObj, null, 2), 'utf8');
}

export function copyFilter(file: string) {
  const name = path.basename(file);
  const result = !ignoreInTemplateDirNames.includes(name);

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

export const makeDeleteTasks = (dependenciesToRemove: string[]) => {
  return dependenciesToRemove.map((dependency) => ({
    title: `Uninstall ${dependency}`,
    task: () => execa('yarn', ['remove', dependency]),
  }));
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
  const title = installedVersion
    ? `Update ${dependency}@${installedVersion} to ${version}`
    : `Install ${dependency}@${version}`;

  return {
    title,
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
  return requiredDeps;
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
  skipPrompts?: boolean,
  noInstall?: boolean
) => {
  if (noInstall) {
    return [];
  }
  const requiredDeps = Object.keys({
    ...modelJson.dependencies,
    ...modelJson.devDependencies,
  });
  if (skipPrompts) {
    return R.compose(
      R.filter(R.compose(R.when(R.is(Function), R.call), R.prop('enabled'))),
      makeInstallOrUpdateTasks
    )(modelJson, packageJson);
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

    return R.compose(
      R.filter(R.compose(R.when(R.is(Function), R.call), R.prop('enabled'))),
      makeInstallOrUpdateTasks
    )(confirmed, packageJson);
  }
};

const updatePackageJson = (
  packageJson: PackageJson,
  modelJson: ModelJson,
  packageJsonFile: string
) => {
  new Promise((res) => {
    if (
      !modelJson.mergeSections &&
      !modelJson.addSections &&
      !modelJson.removeSections
    ) {
      return res(packageJson);
    }
    Object.keys(modelJson.mergeSections || {}).forEach((key) => {
      packageJson[key] = {
        ...packageJson[key],
        ...(modelJson.mergeSections as { [key: string]: any })[key],
      };
    });
    if (modelJson.addSections) {
      packageJson = { ...packageJson, ...modelJson.addSections };
    }
    if (modelJson.removeSections) {
      packageJson = R.omit(modelJson.removeSections as string[], packageJson);
    }
    return writeJsonFile(packageJsonFile, packageJson).then(res);
  });
};

export async function cli() {
  const options = parseArgumentsIntoOptions(process.argv);
  if (options.help) {
    console.log(
      `Usage:

Run in your project root:

merge-template --template /path/to/template-directory

--template         directory with package-json-overrides.json (required) and other files to include
--no-install       skip installation step
--no-copy          skip copy step
--no-delete        skip delete section step
--no-mui-codemod   skip mui codemod
`
    );
    return;
  }
  const {
    noMuiCodemode,
    skipPrompts,
    templateDir,
    projectRoot,
    noInstall,
    noCopy,
    noDelete,
  } = options;
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

  const dependencyTasks = await promptInstall(
    modelJson,
    packageJson,
    skipPrompts,
    noInstall
  );
  const templateFiles =
    !noCopy && !!templateDir && fs.existsSync(templateDir)
      ? fs
          .readdirSync(templateDir)
          .filter((item) => !ignoreInTemplateDirNames.includes(item))
      : [];
  const uninstallDeps = noDelete
    ? []
    : makeDeleteTasks(
        R.intersection(
          Object.keys({
            ...modelJson.deleteDependencies,
            ...modelJson.deleteDevDependencies,
          }),
          Object.keys({
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
          })
        )
      );
  const tasks = [...dependencyTasks, ...uninstallDeps].concat({
    title: `Processing package json`,
    enabled: () =>
      modelJson.mergeSections ||
      modelJson.addSections ||
      modelJson.removeSections,
    task: () => {
      updatePackageJson(packageJson, modelJson, packageJsonFile);
    },
  });

  if (templateFiles.length > 0) {
    tasks.push({
      title: `Add to project ${templateFiles.join(', ')}`,
      task: () => copyTemplateFiles(templateDir as string, projectRoot),
    });
  }
  if (!noMuiCodemode) {
    tasks.push({
      title: 'Rename material-ui imports to mui',
      task: () => execa('npx', ['@mui/codemod', 'v5.0.0/preset-safe', 'src']),
    });
  }

  await new Listr(tasks, { exitOnError: false }).run();
}

function parseArgumentsIntoOptions(rawArgs: string[]) {
  const args = arg(
    {
      '--yes': Boolean,
      '--template': String,
      '--no-install': Boolean,
      '--no-copy': Boolean,
      '--no-delete': Boolean,
      '--no-mui-codemod': Boolean,
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
    noMuiCodemode: args['--no-codemode'] || false,
  };
}

cli();
