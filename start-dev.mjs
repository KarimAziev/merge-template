import packageJson from './package.json' assert { type: 'json' };
import chokidar from 'chokidar';
import Listr from 'listr';
import fs from 'fs';
import globalDirs from 'global-dirs';
import path from 'path';
import { execa } from 'execa';
import fsExtra from 'fs-extra';

const libraryName = packageJson.name;

const isInstalledGlobally = () => {
  try {
    const packageDir = path.join(
      fs.realpathSync(globalDirs.npm.packages),
      libraryName
    );

    const exist = fsExtra.pathExistsSync(packageDir);

    return exist;
  } catch {
    return false;
  }
};

function rebuildSelf() {
  const tasks = new Listr(
    [
      {
        title: 'Building',
        task: () => execa('yarn', ['build']),
      },
      {
        title: 'Uninstall self',
        enabled: () => isInstalledGlobally(),
        task: () => execa('npm', ['rebuild', libraryName, '-g']),
      },
      {
        title: 'Installing self',
        enabled: () => !isInstalledGlobally(),
        task: () =>
          execa('npm', ['install', '--no-audit', process.cwd(), '-g']),
      },
    ],
    { exitOnError: true }
  );
  tasks.run().catch((err) => {
    console.error(err);
  });
}

chokidar.watch('./src/').on('all', (_event, _p) => {
  rebuildSelf();
});
