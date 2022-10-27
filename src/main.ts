import * as R from 'ramda';
import arg from 'arg';
import { execa } from 'execa';
import fs from 'fs';
import inquirer from 'inquirer';
import Listr, { ListrTask } from 'listr';
import ncp from 'ncp';
import path from 'path';
import { promisify } from 'util';
import dns from 'dns';
import { execSync } from 'child_process';
import spawn from 'cross-spawn';
import url from 'url';

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
  peerDependencies?: {
    [key: string]: string;
  };
}
export interface DependenciesHash {
  [key: string]: string;
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
  postTasks: [string[]];
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

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      let httpsProxy = execSync('npm config get https-proxy').toString().trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

export function copyFilter(file: string, filesToIgnore: string[]) {
  const name = path.basename(file);
  const result = !filesToIgnore.includes(name);

  return result;
}
export function checkIfOnline() {
  return new Promise((resolve) => {
    dns.lookup('registry.yarnpkg.com', (err) => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        dns.lookup(url.parse(proxy).hostname as string, (proxyErr) => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}
export function install(
  root: string,
  dependencies: string[],
  verbose: boolean,
  isOnline: boolean,
  flags?: string[]
) {
  return new Promise<void>((resolve, reject) => {
    const command = 'yarn';
    const args = ['add', '--exact'].concat(flags || []).concat(dependencies);
    if (!isOnline) {
      args.push('--offline');
    }

    // Explicitly set cwd() to work around issues like
    // https://github.com/facebook/create-react-app/issues/3326.
    // Unfortunately we can only do this for Yarn because npm support for
    // equivalent --prefix flag doesn't help with this issue.
    // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
    args.push('--cwd');
    args.push(root);

    if (!isOnline) {
      console.log('You appear to be offline.');
      console.log('Falling back to the local Yarn cache.');
      console.log();
    }

    if (verbose) {
      args.push('--verbose');
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code !== 0) {
        reject({
          command: `${command} ${code} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}
export async function copyTemplateFiles(
  sourceDir: string,
  targetDirectory: string,
  filesToIgnore: string[]
) {
  await copy(sourceDir, targetDirectory, {
    clobber: true,
    filter: (file) => copyFilter(file, filesToIgnore),
  });
}

export function locateFile(baseName: string) {
  let dir = process.cwd();
  const shouldUp = (d: string) =>
    fs.existsSync(d) && !fs.existsSync(path.join(d, baseName));

  while (shouldUp(dir)) {
    dir = path.dirname(dir);
  }
  if (fs.existsSync(path.join(dir, baseName))) {
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
    fs.existsSync(d) && !fs.existsSync(path.join(d, '.git'));
  while (shouldUp(dir)) {
    dir = path.dirname(dir);
  }
  return dir;
}

export const makeDeleteTasks = (
  dependenciesToRemove: string[],
  isOnline: boolean
) => {
  if (dependenciesToRemove.length > 0) {
    const flags = isOnline ? [] : ['--offline'];
    return [
      {
        title: `Uninstall ${dependenciesToRemove.join(' ')}`,
        task: () =>
          execa('yarn', ['remove', ...dependenciesToRemove, ...flags]),
      },
    ];
  }
  return [];
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

export interface GroupedDependencies {
  upgrade: string[];
  add: string[];
  flags: string[];
  remove: string[];
}

const flagsHash: Record<
  'dependencies' | 'devDependencies' | 'peerDependencies',
  string[]
> = {
  peerDependencies: ['-P', '--exact'],
  devDependencies: ['-D', '--exact'],
  dependencies: ['--exact'],
};
export const makeInstallationBatchTasks = (
  modelPackageJson: ModelJson,
  packageJson: PackageJson,
  projectRoot: string,
  isOnline: boolean,
  verbose: boolean
) => {
  const devTypes = R.keys(flagsHash);
  const groupDependencies = (
    requiredDependencies: DependenciesHash,
    type: keyof typeof flagsHash
  ) => {
    const flags = flagsHash[type].concat(
      verbose ? ['--verbose', '--cwd', projectRoot] : ['--cwd', projectRoot]
    );
    if (!isOnline) {
      flags.push('--offline');
    }

    const otherTypes = devTypes.filter((v) => v !== type);
    return Object.keys(requiredDependencies || {}).reduce(
      (acc, key) => {
        const requiredVersion = requiredDependencies[key];
        const installedVersion = R.path([type, key], packageJson);

        if (!installedVersion) {
          acc.add.push(`${key}@${requiredVersion}`);
        }
        if (
          !installedVersion &&
          otherTypes.find((depType) => R.path([depType, key], packageJson))
        ) {
          acc.remove.push(key);
        }

        if (installedVersion && installedVersion !== requiredVersion) {
          acc.upgrade.push(`${key}@${requiredVersion}`);
        }
        return acc;
      },
      { upgrade: [], add: [], flags, remove: [] } as GroupedDependencies
    );
  };

  const dependenciesTasks = devTypes
    .filter((type) => !!modelPackageJson[type])
    .reduce(
      (acc, dependencyType) => {
        const group = groupDependencies(
          modelPackageJson[dependencyType] || {},
          dependencyType
        );

        if (group.add.length > 0) {
          const taskArgs = ['add', ...group.add, ...group.flags];
          const addTask = {
            title: `yarn ${taskArgs.join(' ')}`,
            task: () => execa('yarn', taskArgs),
          };
          acc.tasks.push(addTask);
        }
        if (group.upgrade.length > 0) {
          const taskArgs = ['upgrade', ...group.upgrade, ...group.flags];
          const updateTask = {
            title: `yarn ${taskArgs.join(' ')}`,
            task: () => execa('yarn', taskArgs),
          };
          acc.tasks.push(updateTask);
        }

        if (group.remove.length > 0) {
          const removeTask = {
            title: `yarn remove ${group.remove.join(' ')}`,
            task: () => execa('yarn', ['remove', ...group.remove]),
          };
          acc.remove.push(removeTask);
        }
        return acc;
      },
      { remove: [], tasks: [] } as { remove: ListrTask[]; tasks: ListrTask[] }
    );
  return dependenciesTasks.remove.concat(dependenciesTasks.tasks);
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
    ...makeTasks(modelPackageJson.dependencies || {}, ['--exact']),
    ...makeTasks(modelPackageJson.devDependencies || {}, ['-D', '--exact']),
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
export const promptInstall = async (
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
        message: 'Dependencies to install or upgrade',
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
    if (modelJson.removeSections) {
      packageJson = R.omit(modelJson.removeSections as string[], packageJson);
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
    return writeJsonFile(packageJsonFile, packageJson).then(res);
  });
};

export async function cli() {
  const options = parseArgumentsIntoOptions(process.argv);
  if (options.help) {
    return showHelp();
  }
  const {
    templateDir,
    projectRoot,
    noInstall,
    noCopy,
    noDelete,
    noPostTasks,
    ignoreFiles,
    verbose,
  } = options;

  const packageJsonFile =
    projectRoot && path.join(projectRoot as string, 'package.json');

  if (!projectRoot || !packageJsonFile || !templateDir) {
    throw new Error('Project root not found');
  }
  const packageJsonModelFile = path.join(
    templateDir,
    'package-json-overrides.json'
  );

  const modelJson: ModelJson = JSON.parse(
    fs.readFileSync(packageJsonModelFile, 'utf8')
  );
  const packageJson: PackageJson = JSON.parse(
    fs.readFileSync(packageJsonFile, 'utf8')
  );

  try {
    process.chdir(projectRoot);
  } catch (err) {
    console.error(`chdir: ${err}`);
  }
  const isOnline = await checkIfOnline();
  const dependencyTasks = noInstall
    ? []
    : makeInstallationBatchTasks(
        modelJson,
        packageJson,
        projectRoot,
        !!isOnline,
        verbose
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
        ),
        !!isOnline
      );
  const tasks = [...uninstallDeps, ...dependencyTasks].concat([
    {
      title: `Processing package json`,
      enabled: () =>
        !!modelJson.mergeSections ||
        !!modelJson.addSections ||
        !!modelJson.removeSections,
      task: () => {
        updatePackageJson(packageJson, modelJson, packageJsonFile);
      },
    },
  ]);

  if (templateFiles.length > 0) {
    tasks.push({
      title: `Add to project ${templateFiles.join(', ')}`,
      task: () =>
        copyTemplateFiles(templateDir as string, projectRoot, ignoreFiles),
    });
  }
  if (!noPostTasks && modelJson.postTasks) {
    modelJson.postTasks.forEach((task) => {
      const command = task[0];
      const args = task.slice(1) || [];
      tasks.push({
        title: `Running ${command} ${args.join(' ')}`,
        task: () => execa(command, args),
      });
    });
  }

  await new Listr(tasks, { exitOnError: false }).run();
}

function showHelp() {
  console.log(
    `Usage:

Run in your project root:

merge-template

Options:

--template                  use template directory with package-json-overrides.json (required) and other files to include
--no-install                skip installation step
--no-copy-files             don't copy files from template directory
--no-delete                 don't delete dependencies listed in "deleteDependencies" in package-json-overrides.json
--no-post-tasks             don't execute post tasks (section "postTasks" in package-json-overrides.json)
--ignore-files              files in template directory that should't be copied into project. Default: 'node_modules' 'build' 'dist' '.git' 'package-json-overrides.json'
--verbose                   verbose installation 
`
  );
}

function parseArgumentsIntoOptions(rawArgs: string[]) {
  const args = arg(
    {
      '--template': String,
      '--no-install': Boolean,
      '--no-copy-files': Boolean,
      '--no-delete': Boolean,
      '--no-post-tasks': Boolean,
      '--ignore-files': [String],
      '--verbose': Boolean,
      '--help': Boolean,
      '--yes': Boolean,
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
    noCopy: args['--no-copy-files'] || false,
    noPostTasks: args['--no-post-tasks'] || false,
    ignoreFiles: args['--ignore-files'] || ignoreInTemplateDirNames,
    verbose: args['--verbose'] || false,
  };
}

cli();
