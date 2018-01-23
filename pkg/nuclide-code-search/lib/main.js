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

import type {FileResult, Provider} from '../../nuclide-quick-open/lib/types';

import {CodeSearchProvider} from './CodeSearchProvider';
import createPackage from 'nuclide-commons-atom/createPackage';
import UniversalDisposable from 'nuclide-commons/UniversalDisposable';

class Activation {
  _disposables: UniversalDisposable;

  constructor(state: ?mixed) {
    // TODO (wallace): Add activation code here. id:206 gh:207
    this._disposables = new UniversalDisposable();
  }

  dispose(): void {
    this._disposables.dispose();
  }

  registerProvider(): Provider<FileResult> {
    return CodeSearchProvider;
  }
}

createPackage(module.exports, Activation);
