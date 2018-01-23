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

import type {IPCEvent} from './types';
import type {PausedEvent} from 'nuclide-debugger-common/protocol-types';

// eslint-disable-next-line rulesdir/no-commonjs
require('./Protocol/Object');
import InspectorBackendClass from './Protocol/NuclideProtocolParser';

import invariant from 'assert';
import {Observable} from 'rxjs';
import BridgeAdapter from './Protocol/BridgeAdapter';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import {reportError} from './Protocol/EventReporter';

/**
 * Class that dispatches Nuclide commands to debugger engine.
 * This is used to abstract away the underlying implementation for command dispatching
 * and allows us to switch between chrome IPC and new non-chrome channel.
 */
export default class CommandDispatcher {
  _sessionSubscriptions: ?UniversalDisposable;
  _bridgeAdapter: ?BridgeAdapter;
  _getIsReadonlyTarget: () => boolean;
  _shouldFilterBreak: (pausedEvent: PausedEvent) => boolean;

  constructor(
    getIsReadonlyTarget: () => boolean,
    shouldFilterBreak: (pausedEvent: PausedEvent) => boolean,
  ) {
    this._getIsReadonlyTarget = getIsReadonlyTarget;
    this._shouldFilterBreak = shouldFilterBreak;
  }

  setupChromeChannel(): void {
    this._ensureSessionCreated();
    // Do not bother setup load if new channel is enabled.

    invariant(this._bridgeAdapter != null);
    this._bridgeAdapter.enable();
  }

  async setupNuclideChannel(debuggerInstance: Object): Promise<void> {
    this._ensureSessionCreated();
    const dispatchers = await InspectorBackendClass.bootstrap(debuggerInstance);
    this._bridgeAdapter = new BridgeAdapter(
      dispatchers,
      this._getIsReadonlyTarget,
      this._shouldFilterBreak,
    );
    invariant(this._sessionSubscriptions != null);
    this._sessionSubscriptions.add(() => {
      if (this._bridgeAdapter != null) {
        this._bridgeAdapter.dispose();
        this._bridgeAdapter = null;
      }
    });
  }

  _ensureSessionCreated(): void {
    if (this._sessionSubscriptions == null) {
      this._sessionSubscriptions = new UniversalDisposable();
    }
  }

  cleanupSessionState(): void {
    if (this._sessionSubscriptions != null) {
      this._sessionSubscriptions.dispose();
      this._sessionSubscriptions = null;
    }
  }

  send(...args: Array<any>): void {
    this._sendViaNuclideChannel(...args);
  }

  getEventObservable(): Observable<IPCEvent> {
    invariant(this._bridgeAdapter != null);
    return this._bridgeAdapter.getEventObservable();
  }

  _sendViaNuclideChannel(...args: Array<any>): void {
    if (this._bridgeAdapter == null) {
      return;
    }
    switch (args[0]) {
      case 'Continue':
        this._bridgeAdapter.resume();
        break;
      case 'Pause':
        this._bridgeAdapter.pause();
        break;
      case 'StepOver':
        this._bridgeAdapter.stepOver();
        break;
      case 'StepInto':
        this._bridgeAdapter.stepInto();
        break;
      case 'StepOut':
        this._bridgeAdapter.stepOut();
        break;
      case 'RunToLocation':
        this._bridgeAdapter.runToLocation(args[1], args[2], args[3]);
        break;
      case 'triggerDebuggerAction':
        this._triggerDebuggerAction(args[1]);
        break;
      case 'SyncBreakpoints':
        this._bridgeAdapter.setInitialBreakpoints(args[1]);
        break;
      case 'AddBreakpoint':
        this._bridgeAdapter.setFilelineBreakpoint(args[1]);
        break;
      case 'DeleteBreakpoint':
        this._bridgeAdapter.removeBreakpoint(args[1]);
        break;
      case 'UpdateBreakpoint':
        this._bridgeAdapter.updateBreakpoint(args[1]);
        break;
      case 'setSelectedCallFrameIndex':
        this._bridgeAdapter.setSelectedCallFrameIndex(args[1]);
        break;
      case 'evaluateOnSelectedCallFrame':
        this._bridgeAdapter.evaluateExpression(args[1], args[2], args[3]);
        break;
      case 'runtimeEvaluate':
        this._bridgeAdapter.evaluateExpression(args[1], args[2], 'console');
        break;
      case 'setVariable':
        this._bridgeAdapter.setVariable(args[1], args[2], args[3], args[4]);
        break;
      case 'completions':
        this._bridgeAdapter.completions(args[1], args[2], args[3]);
        break;
      case 'getProperties':
        this._bridgeAdapter.getProperties(args[1], args[2]);
        break;
      case 'selectThread':
        this._bridgeAdapter.selectThread(args[1]);
        break;
      case 'setPauseOnException':
        this._bridgeAdapter.setPauseOnException(args[1]);
        break;
      case 'setPauseOnCaughtException':
        this._bridgeAdapter.setPauseOnCaughtException(args[1]);
        break;
      case 'setSingleThreadStepping':
        this._bridgeAdapter.setSingleThreadStepping(args[1]);
        break;
      case 'setShowDisassembly':
        this._bridgeAdapter.setShowDisassembly(args[1]);
        break;
      default:
        reportError(`Command ${args[0]} is not implemented yet.`);
        break;
    }
  }

  _triggerDebuggerAction(actionId: string): void {
    invariant(this._bridgeAdapter != null);
    switch (actionId) {
      case 'debugger.toggle-pause':
        // TODO [jetan]: 'debugger.toggle-pause' needs to implement state management which id:439 gh:440
        // I haven't think well yet so forward to chrome for now.
        reportError('toggle-pause is not implemented yet.');
        break;
      case 'debugger.step-over':
        this._bridgeAdapter.stepOver();
        break;
      case 'debugger.step-into':
        this._bridgeAdapter.stepInto();
        break;
      case 'debugger.step-out':
        this._bridgeAdapter.stepOut();
        break;
      case 'debugger.run-snippet':
        this._bridgeAdapter.resume();
        break;
      default:
        throw Error(
          `_triggerDebuggerAction: unrecognized actionId: ${actionId}`,
        );
    }
  }

  getBridgeAdapter(): ?BridgeAdapter {
    return this._bridgeAdapter;
  }
}
