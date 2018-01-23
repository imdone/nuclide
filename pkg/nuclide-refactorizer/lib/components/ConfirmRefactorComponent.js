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

import type {Store, ConfirmPhase} from '../types';
import type {RefactorEditResponse} from '../rpc-types';
import type {NuclideUri} from 'nuclide-commons/nuclideUri';

import * as React from 'react';

import {getAtomProjectRelativePath} from 'nuclide-commons-atom/projects';
import {pluralize} from 'nuclide-commons/string';
import {Button, ButtonTypes} from 'nuclide-commons-ui/Button';
import {Icon} from 'nuclide-commons-ui/Icon';
import {TreeList, TreeItem} from 'nuclide-commons-ui/Tree';
import PathWithFileIcon from '../../../nuclide-ui/PathWithFileIcon';

import * as Actions from '../refactorActions';

type Props = {
  phase: ConfirmPhase,
  store: Store,
};

export class ConfirmRefactorComponent extends React.PureComponent<Props> {
  _execute = () => {
    this.props.store.dispatch(Actions.apply(this.props.phase.response));
  };

  _diffPreview = (uri: NuclideUri, response: RefactorEditResponse) => {
    this.props.store.dispatch(
      Actions.loadDiffPreview(this.props.phase, uri, response),
    );
  };

  render(): React.Node {
    const {response} = this.props.phase;
    const editCount = new Map();
    for (const [path, edits] of response.edits) {
      editCount.set(path, (editCount.get(path) || 0) + edits.length);
    }
    // TODO: display actual diff output here. id:506 gh:507
    return (
      <div>
        This refactoring will affect {editCount.size} files. Confirm?
        <div
          // Make the text copyable + selectable.
          className="nuclide-refactorizer-confirm-list native-key-bindings"
          tabIndex={-1}>
          <TreeList>
            {Array.from(editCount).map(([path, count]) => (
              <TreeItem key={path}>
                <PathWithFileIcon
                  className={'nuclide-refactorizer-confirm-list-item'}
                  path={path}>
                  <Icon
                    className="nuclide-refactorizer-diff-preview-icon"
                    onClick={() => {
                      this._diffPreview(path, response);
                    }}
                    icon="diff"
                  />
                  <span className="nuclide-refactorizer-confirm-list-path">
                    {getAtomProjectRelativePath(path)}
                  </span>{' '}
                  ({count} {pluralize('change', count)})
                </PathWithFileIcon>
              </TreeItem>
            ))}
          </TreeList>
        </div>
        <div style={{display: 'flex', justifyContent: 'flex-end'}}>
          <Button
            buttonType={ButtonTypes.PRIMARY}
            onClick={this._execute}
            autoFocus={true}>
            Confirm
          </Button>
        </div>
      </div>
    );
  }
}
