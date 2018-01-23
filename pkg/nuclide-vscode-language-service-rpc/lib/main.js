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

import type {SearchStrategy} from '../../../modules/nuclide-commons/ConfigCache';
import type {FileNotifier} from '../../nuclide-open-files-rpc/lib/rpc-types';
import type {HostServices} from '../../nuclide-language-service-rpc/lib/rpc-types';
import type {LanguageService} from '../../nuclide-language-service/lib/LanguageService';
import type {LogLevel} from '../../nuclide-logging/lib/rpc-types';

import invariant from 'assert';
import {getLogger} from 'log4js';
import which from 'nuclide-commons/which';
import {LspLanguageService} from './LspLanguageService';
import {FileCache} from '../../nuclide-open-files-rpc/lib/main';
import {
  MultiProjectLanguageService,
  forkHostServices,
} from '../../nuclide-language-service-rpc';

/**
 * Creates a language service capable of connecting to an LSP server.
 * Note that spawnOptions and initializationOptions must both be RPC-able.
 *
 * TODO: Document all of the fields below. id:560 gh:561
 */
export async function createMultiLspLanguageService(
  languageId: string,
  command: string,
  args: Array<string>,
  params: {|
    spawnOptions?: Object,
    initializationOptions?: Object,
    fileNotifier: FileNotifier,
    host: HostServices,
    projectFileNames: Array<string>,
    projectFileSearchStrategy?: SearchStrategy,
    useOriginalEnvironment?: boolean,
    fileExtensions: Array<string>,
    logCategory: string,
    logLevel: LogLevel,
    additionalLogFilesRetentionPeriod?: number,
  |},
): Promise<?LanguageService> {
  const logger = getLogger(params.logCategory);
  logger.setLevel(params.logLevel);

  if ((await which(command)) == null) {
    const message = `Command "${command}" could not be found: ${languageId} language features will be disabled.`;
    logger.warn(message);
    params.host.consoleNotification(languageId, 'warning', message);
    return null;
  }

  const result = new MultiProjectLanguageService();

  const fileCache = params.fileNotifier;
  invariant(fileCache instanceof FileCache);

  // This MultiProjectLanguageService stores LspLanguageServices, lazily
  // created upon demand, one per project root. Demand is usually "when the
  // user opens a file" or "when the user requests project-wide symbol search".

  // What state is each LspLanguageService in? ...
  // * 'Initializing' state, still spawning the LSP server and negotiating with
  //    it, or inviting the user via a dialog box to retry initialization.
  // * 'Ready' state, able to handle LanguageService requests properly.
  // * 'Stopped' state, meaning that the LspConnection died and will not be
  //   restarted, but we can still respond to those LanguageServiceRequests
  //   that don't require an LspConnection).

  const languageServiceFactory = async (projectDir: string) => {
    await result.hasObservedDiagnostics();
    // We're awaiting until AtomLanguageService has observed diagnostics (to
    // prevent race condition: see below).

    const lsp = new LspLanguageService(
      logger,
      fileCache,
      await forkHostServices(params.host, logger),
      languageId,
      command,
      args,
      params.spawnOptions,
      projectDir,
      params.fileExtensions,
      params.initializationOptions || {},
      Number(params.additionalLogFilesRetentionPeriod),
      params.useOriginalEnvironment || false,
    );

    lsp.start(); // Kick off 'Initializing'...
    return lsp;

    // CARE! We want to avoid a race condition where LSP starts producing
    // diagnostics before AtomLanguageService has yet had a chance to observe
    // them (and we don't want to have to buffer the diagnostics indefinitely).
    // We rely on the fact that LSP won't produce them before start() has
    // returned. As soon as we ourselves return, MultiProjectLanguageService
    // will hook up observeDiagnostics into the LSP process, so it'll be ready.
  };

  result.initialize(
    logger,
    fileCache,
    params.host,
    params.projectFileNames,
    params.projectFileSearchStrategy,
    params.fileExtensions,
    languageServiceFactory,
  );
  return result;
}
