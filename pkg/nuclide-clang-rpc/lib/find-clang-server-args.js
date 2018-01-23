/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import nuclideUri from 'nuclide-commons/nuclideUri';

import {runCommand} from 'nuclide-commons/process';

let fbFindClangServerArgs: ?(src: ?string) => {[string]: ?string};

export type ClangServerArgs = {
  libClangLibraryFile: ?string,
  pythonExecutable: string,
  pythonPathEnv: ?string,
};

export default (async function findClangServerArgs(
  src?: string,
  libclangPath: ?string = null,
): Promise<ClangServerArgs> {
  if (fbFindClangServerArgs === undefined) {
    fbFindClangServerArgs = null;
    try {
      // $FlowFB
      fbFindClangServerArgs = require('./fb/find-clang-server-args').default;
    } catch (e) {
      // Ignore.
    }
  }

  let libClangLibraryFile;
  if (process.platform === 'darwin') {
    try {
      const stdout = await runCommand('xcode-select', [
        '--print-path',
      ]).toPromise();
      libClangLibraryFile = stdout.trim();
      // If the user only has Xcode Command Line Tools installed, the path is different.
      if (nuclideUri.basename(libClangLibraryFile) !== 'CommandLineTools') {
        libClangLibraryFile += '/Toolchains/XcodeDefault.xctoolchain';
      }
      libClangLibraryFile += '/usr/lib/libclang.dylib';
    } catch (err) {}
  }

  // TODO (asuarez): Fix this when we have server-side settings. id:336 gh:337
  if (global.atom) {
    const path = ((atom.config.get(
      'nuclide.nuclide-clang.libclangPath',
    ): any): ?string);
    // flowlint-next-line sketchy-null-string:off
    if (path) {
      libClangLibraryFile = path.trim();
    }
  }

  let clangServerArgs = {
    libClangLibraryFile,
    pythonExecutable: 'python2.7',
    pythonPathEnv: nuclideUri.join(__dirname, '../VendorLib'),
  };

  if (typeof fbFindClangServerArgs === 'function') {
    const clangServerArgsOverrides = await fbFindClangServerArgs(src);
    clangServerArgs = {
      ...clangServerArgs,
      ...clangServerArgsOverrides,
    };
  }

  if (libclangPath != null) {
    clangServerArgs.libClangLibraryFile = libclangPath;
  }
  return clangServerArgs;
});
