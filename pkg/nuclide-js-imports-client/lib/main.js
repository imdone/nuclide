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

// $FlowFB
import type {ProjectSymbolSearchProvider} from '../../fb-go-to-project-symbol-omni2-provider/lib/types';
import type {CodeActionConfig} from '../../nuclide-language-service/lib/CodeActionProvider';
import type {
  GlobalProviderType,
  SymbolResult,
} from '../../nuclide-quick-open/lib/types';
import type {ServerConnection} from '../../nuclide-remote-connection';
import type {AtomLanguageServiceConfig} from '../../nuclide-language-service/lib/AtomLanguageService';
import type {LanguageService} from '../../nuclide-language-service/lib/LanguageService';

import createPackage from 'nuclide-commons-atom/createPackage';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import typeof * as JsService from '../../nuclide-js-imports-client-rpc/lib/JsImportsService';

import {applyTextEditsToBuffer} from 'nuclide-commons-atom/text-edit';
import {TAB_SIZE_SIGNIFYING_FIX_ALL_IMPORTS_FORMATTING} from '../../nuclide-js-imports-server/src/utils/constantsForClient';
import {
  AtomLanguageService,
  getHostServices,
} from '../../nuclide-language-service';
import {NullLanguageService} from '../../nuclide-language-service-rpc';
import {
  getNotifierByConnection,
  getFileVersionOfEditor,
} from '../../nuclide-open-files';
import {getServiceByConnection} from '../../nuclide-remote-connection';
import featureConfig from 'nuclide-commons-atom/feature-config';
import QuickOpenProvider from './QuickOpenProvider';
import JSSymbolSearchProvider from './JSSymbolSearchProvider';
import Omni2ProjectSymbolProvider from './Omni2ProjectSymbolProvider';

const JS_IMPORTS_SERVICE_NAME = 'JSAutoImportsService';

async function connectToJSImportsService(
  connection: ?ServerConnection,
): Promise<LanguageService> {
  const jsService: JsService = getServiceByConnection(
    JS_IMPORTS_SERVICE_NAME,
    connection,
  );

  const [fileNotifier, host] = await Promise.all([
    getNotifierByConnection(connection),
    getHostServices(),
  ]);

  const lspService = await jsService.initializeLsp(
    ['.flowconfig'],
    ['.js'],
    (featureConfig.get('nuclide-js-imports-client.logLevel'): any),
    fileNotifier,
    host,
    getAutoImportSettings(),
  );
  return lspService || new NullLanguageService();
}

function createLanguageService(): AtomLanguageService<LanguageService> {
  const diagnosticsConfig = {
    version: '0.2.0',
    analyticsEventName: 'jsimports.observe-diagnostics',
  };

  const autocompleteConfig = {
    inclusionPriority: 1,
    suggestionPriority: 3,
    excludeLowerPriority: false,
    analytics: {
      eventName: 'nuclide-js-imports',
      shouldLogInsertedSuggestion: false,
    },
    disableForSelector: null,
    autocompleteCacherConfig: null,
  };

  const codeActionConfig: CodeActionConfig = {
    version: '0.1.0',
    priority: 0,
    analyticsEventName: 'jsimports.codeAction',
    applyAnalyticsEventName: 'jsimports.applyCodeAction',
  };

  const atomConfig: AtomLanguageServiceConfig = {
    name: 'JSAutoImports',
    grammars: ['source.js.jsx', 'source.js'],
    diagnostics: diagnosticsConfig,
    autocomplete: autocompleteConfig,
    codeAction: codeActionConfig,
  };
  return new AtomLanguageService(connectToJSImportsService, atomConfig);
}

function getAutoImportSettings() {
  // Currently, we will get the settings when the package is initialized. This
  // means that the user would need to restart Nuclide for a change in their
  // settings to take effect. In the future, we would most likely want to observe
  // their settings and send DidChangeConfiguration requests to the server.
  // TODO: Observe settings changes + send to the server. id:413 gh:414
  return {
    diagnosticsWhitelist: featureConfig.get(
      'nuclide-js-imports-client.diagnosticsWhitelist',
    ),
    requiresWhitelist: featureConfig.get(
      'nuclide-js-imports-client.requiresWhitelist',
    ),
  };
}

class Activation {
  _languageService: AtomLanguageService<LanguageService>;
  _quickOpenProvider: QuickOpenProvider;
  _commandSubscription: UniversalDisposable;

  constructor() {
    this._languageService = createLanguageService();
    this._languageService.activate();
    this._quickOpenProvider = new QuickOpenProvider(this._languageService);
    this._commandSubscription = new UniversalDisposable();
  }

  provideProjectSymbolSearch(): ProjectSymbolSearchProvider {
    return new Omni2ProjectSymbolProvider(this._languageService);
  }

  provideJSSymbolSearchService(): JSSymbolSearchProvider {
    return new JSSymbolSearchProvider(this._languageService);
  }

  dispose() {
    this._languageService.dispose();
    this._commandSubscription.dispose();
  }

  registerQuickOpenProvider(): GlobalProviderType<SymbolResult> {
    return this._quickOpenProvider;
  }

  consumeOrganizeRequiresService(
    organizeRequires: ({
      addedRequires: boolean,
      missingExports: boolean,
    }) => void,
  ): UniversalDisposable {
    this._commandSubscription.add(
      atom.commands.add(
        'atom-text-editor',
        'nuclide-js-imports:auto-require',
        async () => {
          const editor = atom.workspace.getActiveTextEditor();
          if (editor == null) {
            return;
          }
          const fileVersion = await getFileVersionOfEditor(editor);
          if (fileVersion == null) {
            return;
          }
          const buffer = editor.getBuffer();
          const range = buffer.getRange();
          const languageService = await this._languageService.getLanguageServiceForUri(
            editor.getPath(),
          );
          if (languageService == null) {
            return;
          }
          const triggerOptions = {
            // secret code
            tabSize: TAB_SIZE_SIGNIFYING_FIX_ALL_IMPORTS_FORMATTING,
            // just for typechecking to pass
            insertSpaces: true,
          };
          const result = await languageService.formatSource(
            fileVersion,
            range,
            triggerOptions,
          );
          const beforeEditsCheckpoint = buffer.createCheckpoint();
          // First add all new imports naively
          if (result != null) {
            if (!applyTextEditsToBuffer(buffer, result)) {
              // TODO (T24077432): Show the error to the user id:446 gh:447
              throw new Error('Could not apply edits to text buffer.');
            }
          }
          // Then use nuclide-format-js to properly format the imports
          const successfulEdits = (result || []).filter(
            edit => edit.newText !== '',
          );
          organizeRequires({
            addedRequires: successfulEdits.length > 0,
            missingExports: successfulEdits.length !== (result || []).length,
          });
          buffer.groupChangesSinceCheckpoint(beforeEditsCheckpoint);
        },
      ),
    );
    return this._commandSubscription;
  }
}

createPackage(module.exports, Activation);
