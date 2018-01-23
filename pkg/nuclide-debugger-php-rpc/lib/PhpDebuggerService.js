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

import type {ConnectableObservable} from 'rxjs';
import type {LogLevel} from '../../nuclide-logging/lib/rpc-types';
import type {AtomNotification} from 'nuclide-debugger-common';

import logger from './utils';
import {hphpdMightBeAttached} from './helpers';
import {clearConfig, setConfig} from './config';
import {setRootDirectoryUri} from './ConnectionUtils';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import {
  ClientCallback,
  VsAdapterTypes,
  VsDebugSessionTranslator,
} from 'nuclide-debugger-common/main';

export type PhpDebuggerSessionConfig = {
  xdebugAttachPort: number,
  xdebugLaunchingPort: number,
  launchScriptPath?: string,
  pid?: number,
  attachScriptRegex?: string,
  idekeyRegex?: string,
  endDebugWhenNoRequests?: boolean,
  logLevel: LogLevel,
  targetUri: string,
  phpRuntimePath: string,
  phpRuntimeArgs: string,
  scriptArguments: Array<string>,
  dummyRequestFilePath: string,
  stopOneStopAll: boolean,
  launchWrapperCommand?: string,
  deferLaunch: boolean,
};

// Connection states
const INITIAL = 'initial';
const CONNECTING = 'connecting';
const CONNECTED = 'connected';
const CLOSED = 'closed';

/**
 * Proxy for converting between Nuclide debugger
 * and HHVM Dbgp debuggee.
 *
 * Dbgp spec is here:
 * http://xdebug.org/docs-dbgp.php
 *
 * Usage:
 *    Call debug(config) to attach to the dbgp debuggee, or launch a script specified in the config.
 *    After the promise returned by debug() is resolved, call sendCommand() to send Chrome Commands,
 *    and be prepared to receive notifications via the server notifications observable.
 */

export class PhpDebuggerService {
  _state: string;
  _translator: ?VsDebugSessionTranslator;
  _clientCallback: ClientCallback;
  _disposables: UniversalDisposable;

  constructor() {
    this._state = INITIAL;
    this._translator = null;
    this._disposables = new UniversalDisposable();
    this._clientCallback = new ClientCallback();
    this._disposables.add(this._clientCallback);
  }

  getNotificationObservable(): ConnectableObservable<AtomNotification> {
    return this._clientCallback.getAtomNotificationObservable().publish();
  }

  getServerMessageObservable(): ConnectableObservable<string> {
    return this._clientCallback.getServerMessageObservable().publish();
  }

  getOutputWindowObservable(): ConnectableObservable<string> {
    return this._clientCallback.getOutputWindowObservable().publish();
  }

  async debug(config: PhpDebuggerSessionConfig): Promise<string> {
    config.stopOneStopAll = false;
    logger.info('Connecting config: ' + JSON.stringify(config));

    await this._warnIfHphpdAttached();

    setConfig(config);
    await setRootDirectoryUri(config.targetUri);
    logger.setLevel(config.logLevel);
    this._setState(CONNECTING);

    const translator = new VsDebugSessionTranslator(
      VsAdapterTypes.HHVM,
      {
        command: this._getNodePath(),
        args: [require.resolve('./vscode/vscode-debugger-entry')],
      },
      'launch',
      {
        config,
        trace: false,
      },
      this._clientCallback,
      logger,
    );
    this._disposables.add(
      translator,
      translator.observeSessionEnd().subscribe(this._onEnd.bind(this)),
      () => (this._translator = null),
    );
    this._translator = translator;
    await translator.initilize();
    this._setState(CONNECTED);

    return 'HHVM connected';
  }

  _getNodePath(): string {
    try {
      // $FlowFB
      return require('nuclide-debugger-common//fb-constants')
        .DEVSERVER_NODE_PATH;
    } catch (error) {
      return 'node';
    }
  }

  async sendCommand(message: string): Promise<void> {
    logger.info('Received command: ' + message);
    if (this._translator) {
      this._translator.processCommand(JSON.parse(message));
    }
  }

  async _warnIfHphpdAttached(): Promise<void> {
    const mightBeAttached = await hphpdMightBeAttached();
    if (mightBeAttached) {
      this._clientCallback.sendAtomNotification(
        'warning',
        'You may have an hphpd instance currently attached to your server!' +
          '<br />Please kill it, or the Nuclide debugger may not work properly.',
      );
    }
  }

  _onEnd(): void {
    this._setState(CLOSED);
  }

  _setState(newState: string): void {
    logger.debug('state change from ' + this._state + ' to ' + newState);
    // TODO: Consider logging socket info: remote ip, etc. id:250 gh:251
    this._state = newState;

    if (this._state === CLOSED) {
      this.dispose();
    }
  }

  dispose(): Promise<void> {
    logger.info('Proxy: Ending session');
    clearConfig();
    this._disposables.dispose();
    return Promise.resolve();
  }
}
