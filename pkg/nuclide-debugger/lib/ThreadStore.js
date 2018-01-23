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

import type {ThreadItem, NuclideThreadData, DebuggerModeType} from './types';
import type {DatatipService} from 'atom-ide-ui';
import type DebuggerDispatcher, {DebuggerAction} from './DebuggerDispatcher';
import {Emitter} from 'atom';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import * as React from 'react';
import {Icon} from 'nuclide-commons-ui/Icon';
import nuclideUri from 'nuclide-commons/nuclideUri';
import {ActionTypes} from './DebuggerDispatcher';
import {DebuggerMode} from './DebuggerStore';

export default class ThreadStore {
  _disposables: IDisposable;
  _datatipService: ?DatatipService;
  _emitter: Emitter;
  _threadMap: Map<number, ThreadItem>;
  _owningProcessId: number;
  _selectedThreadId: number;
  _stopThreadId: number;
  _threadChangeDatatip: ?IDisposable;
  _threadsReloading: boolean;
  _debuggerMode: DebuggerModeType;

  constructor(dispatcher: DebuggerDispatcher) {
    const dispatcherToken = dispatcher.register(this._handlePayload.bind(this));
    this._disposables = new UniversalDisposable(() => {
      dispatcher.unregister(dispatcherToken);
    });
    this._datatipService = null;
    this._emitter = new Emitter();
    this._threadMap = new Map();
    this._owningProcessId = 0;
    this._selectedThreadId = 0;
    this._stopThreadId = 0;
    this._threadsReloading = false;
    this._debuggerMode = DebuggerMode.STOPPED;
  }

  setDatatipService(service: DatatipService) {
    this._datatipService = service;
  }

  _handlePayload(payload: DebuggerAction): void {
    switch (payload.actionType) {
      case ActionTypes.CLEAR_INTERFACE:
        this._handleClearInterface();
        this._emitter.emit('change');
        break;
      case ActionTypes.UPDATE_THREADS:
        this._threadsReloading = false;
        this._updateThreads(payload.data.threadData);
        this._emitter.emit('change');
        break;
      case ActionTypes.UPDATE_THREAD:
        this._threadsReloading = false;
        this._updateThread(payload.data.thread);
        this._emitter.emit('change');
        break;
      case ActionTypes.UPDATE_STOP_THREAD:
        this._updateStopThread(payload.data.id);
        this._emitter.emit('change');
        break;
      case ActionTypes.UPDATE_SELECTED_THREAD:
        this._updateSelectedThread(payload.data.id);
        this._emitter.emit('change');
        break;
      case ActionTypes.NOTIFY_THREAD_SWITCH:
        this._notifyThreadSwitch(
          payload.data.sourceURL,
          payload.data.lineNumber,
          payload.data.message,
        );
        break;
      case ActionTypes.DEBUGGER_MODE_CHANGE:
        if (
          this._debuggerMode === DebuggerMode.RUNNING &&
          payload.data === DebuggerMode.PAUSED
        ) {
          // If the debugger just transitioned from running to paused, the debug server should
          // be sending updated thread stacks. This may take a moment.
          this._threadsReloading = true;
        } else if (payload.data === DebuggerMode.RUNNING) {
          // The UI is never waiting for threads if it's running.
          this._threadsReloading = false;
        }
        this._debuggerMode = payload.data;
        this._emitter.emit('change');
        break;
      default:
        return;
    }
  }

  _updateThreads(threadData: NuclideThreadData): void {
    this._threadMap.clear();
    this._owningProcessId = threadData.owningProcessId;
    if (
      !Number.isNaN(threadData.stopThreadId) &&
      threadData.stopThreadId >= 0
    ) {
      this._stopThreadId = threadData.stopThreadId;
      this._selectedThreadId = threadData.stopThreadId;
    }

    this._threadsReloading = false;
    threadData.threads.forEach(thread =>
      this._threadMap.set(Number(thread.id), thread),
    );
  }

  _updateThread(thread: ThreadItem): void {
    // TODO (jonaldislarry): add deleteThread API so that this stop reason checking is not needed. id:368 gh:369
    if (
      thread.stopReason === 'end' ||
      thread.stopReason === 'error' ||
      thread.stopReason === 'stopped'
    ) {
      this._threadMap.delete(Number(thread.id));
    } else {
      this._threadMap.set(Number(thread.id), thread);
    }
  }

  _updateStopThread(id: number) {
    this._stopThreadId = Number(id);
    this._selectedThreadId = Number(id);
  }

  _updateSelectedThread(id: number) {
    this._selectedThreadId = Number(id);
  }

  _handleClearInterface(): void {
    this._threadMap.clear();
    this._cleanUpDatatip();
  }

  _cleanUpDatatip(): void {
    if (this._threadChangeDatatip) {
      if (this._datatipService != null) {
        this._threadChangeDatatip.dispose();
      }
      this._threadChangeDatatip = null;
    }
  }

  // TODO (dbonafilia): refactor this code along with the ui code in callstackStore to a ui controller. id:264 gh:265
  async _notifyThreadSwitch(
    sourceURL: string,
    lineNumber: number,
    message: string,
  ): Promise<void> {
    const path = nuclideUri.uriToNuclideUri(sourceURL);
    // we want to put the message one line above the current line unless the selected
    // line is the top line, in which case we will put the datatip next to the line.
    const notificationLineNumber = lineNumber === 0 ? 0 : lineNumber - 1;
    // only handle real files for now
    const datatipService = this._datatipService;
    if (datatipService != null && path != null && atom.workspace != null) {
      // This should be goToLocation instead but since the searchAllPanes option is correctly
      // provided it's not urgent.
      // eslint-disable-next-line rulesdir/atom-apis
      atom.workspace.open(path, {searchAllPanes: true}).then(editor => {
        const buffer = editor.getBuffer();
        const rowRange = buffer.rangeForRow(notificationLineNumber);
        this._threadChangeDatatip = datatipService.createPinnedDataTip(
          {
            component: this._createAlertComponentClass(message),
            range: rowRange,
            pinnable: true,
          },
          editor,
        );
      });
    }
  }

  getThreadList(): Array<ThreadItem> {
    return Array.from(this._threadMap.values());
  }

  getSelectedThreadId(): number {
    return this._selectedThreadId;
  }

  getThreadsReloading(): boolean {
    return this._threadsReloading;
  }

  getStopThread(): ?number {
    return this._stopThreadId;
  }

  onChange(callback: () => void): IDisposable {
    return this._emitter.on('change', callback);
  }

  _createAlertComponentClass(message: string): React.ComponentType<any> {
    return () => (
      <div className="nuclide-debugger-thread-switch-alert">
        <Icon icon="alert" />
        {message}
      </div>
    );
  }

  dispose(): void {
    this._cleanUpDatatip();
    this._disposables.dispose();
  }
}
