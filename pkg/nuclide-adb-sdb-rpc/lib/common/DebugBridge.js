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

import type {LegacyProcessMessage} from 'nuclide-commons/process';
import type {DebugBridgeConfig, DeviceId} from '../types';

import {Observable} from 'rxjs';
import {observeProcess, runCommand} from 'nuclide-commons/process';

export const DEFAULT_ADB_PORT = 5037;

export type getDevicesOptions = {
  port?: number,
};

export class DebugBridge {
  static configObs: Observable<DebugBridgeConfig>;

  _device: DeviceId;

  constructor(device: DeviceId) {
    this._device = device;
  }

  runShortCommand(...command: string[]): Observable<string> {
    return this.constructor.configObs.switchMap(config =>
      runCommand(config.path, this.getDeviceArgs().concat(command)),
    );
  }

  runLongCommand(...command: string[]): Observable<LegacyProcessMessage> {
    // TODO (T17463635) id:640 gh:641
    return this.constructor.configObs.switchMap(config =>
      observeProcess(config.path, this.getDeviceArgs().concat(command), {
        killTreeWhenDone: true,
        /* TODO (T17353599) id:182 gh:183*/ isExitError: () => false,
      }).catch(error => Observable.of({kind: 'error', error})),
    ); // TODO (T17463635) id:280 gh:281
  }

  getDeviceArgs(): Array<string> {
    throw new Error('Needs to be implemented by subclass!');
  }

  static _parseDevicesCommandOutput(stdout: string, port: number) {
    return stdout
      .split(/\n+/g)
      .slice(1)
      .filter(s => s.length > 0 && !s.trim().startsWith('*'))
      .map(s => s.split(/\s+/g))
      .filter(a => a[0] !== '')
      .map(a => ({
        name: a[0],
        port,
      }));
  }

  static getDevices(options?: getDevicesOptions): Observable<Array<DeviceId>> {
    const {port: optionPort} = options || {};
    return this.configObs.switchMap(config => {
      const ports = optionPort != null ? [optionPort] : config.ports;
      const commandObs =
        ports.length > 0
          ? Observable.concat(
              ...ports.map(port =>
                runCommand(config.path, ['-P', String(port), 'devices']).map(
                  stdout => this._parseDevicesCommandOutput(stdout, port),
                ),
              ),
            )
          : Observable.concat(
              runCommand(config.path, ['devices']).map(stdout =>
                this._parseDevicesCommandOutput(stdout, -1),
              ),
            );

      return commandObs
        .toArray()
        .switchMap(deviceList =>
          Observable.of(
            deviceList.reduce((a, b) => (a != null ? a.concat(...b) : b)),
          ),
        );
    });
  }
}
